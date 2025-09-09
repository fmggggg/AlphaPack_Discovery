import numpy as np
import re
from io import StringIO

def split_numeric(val, precision=1):
    s = f"{val:.{precision}f}"
    return list(s)

def abs_cap(val, max_abs_val=1):
    """
    Returns the value with its absolute value capped at max_abs_val.
    Particularly useful in passing values to trignometric functions where
    numerical errors may result in an argument > 1 being passed in.
    https://github.com/materialsproject/pymatgen/blob/b789d74639aa851d7e5ee427a765d9fd5a8d1079/pymatgen/util/num.py#L15
    Args:
        val (float): Input value.
        max_abs_val (float): The maximum absolute value for val. Defaults to 1.
    Returns:
        val if abs(val) < 1 else sign of val * max_abs_val.
    """
    return max(min(val, max_abs_val), -max_abs_val)

def lattice_params_to_matrix(a, b, c, alpha, beta, gamma):
    """Converts lattice from abc, angles to matrix.
    https://github.com/materialsproject/pymatgen/blob/b789d74639aa851d7e5ee427a765d9fd5a8d1079/pymatgen/core/lattice.py#L311
    """
    angles_r = np.radians([alpha, beta, gamma])
    cos_alpha, cos_beta, cos_gamma = np.cos(angles_r)
    sin_alpha, sin_beta, sin_gamma = np.sin(angles_r)

    val = (cos_alpha * cos_beta - cos_gamma) / (sin_alpha * sin_beta)
    # Sometimes rounding errors result in values slightly > 1.
    val = abs_cap(val)
    gamma_star = np.arccos(val)

    vector_a = [a * sin_beta, 0.0, a * cos_beta]
    vector_b = [
        -b * sin_alpha * np.cos(gamma_star),
        b * sin_alpha * np.sin(gamma_star),
        b * cos_alpha,
    ]
    vector_c = [0.0, 0.0, float(c)]
    return np.array([vector_a, vector_b, vector_c])

def cart_to_frac_numpy(cart, lattice):
    lattice_inv = np.linalg.inv(lattice)
    return np.dot(cart, lattice_inv)

def rotmat_to_rodrigues(R):
    trace = np.trace(R)
    t = (trace - 1.0) / 2.0
    t = max(min(t, 1.0), -1.0)
    theta = np.arccos(t)
    if abs(theta) < 1e-8:
        return np.zeros(3)
    rx, ry, rz = R[2,1] - R[1,2], R[0,2] - R[2,0], R[1,0] - R[0,1]
    axis = np.array([rx, ry, rz]) / (2.0 * np.sin(theta))
    return axis * np.tan(theta/2)

def rodrigues_to_rotmat(r):
    theta = 2*np.arctan(np.linalg.norm(r))
    if np.linalg.norm(r)<1e-8:
        return np.eye(3)
    u = r/np.linalg.norm(r)
    ux,uy,uz = u
    ct,st = np.cos(theta), np.sin(theta)
    oc = 1-ct
    R = np.array([
        [ct+ux*ux*oc, ux*uy*oc-uz*st, ux*uz*oc+uy*st],
        [uy*ux*oc+uz*st, ct+uy*uy*oc, uy*uz*oc-ux*st],
        [uz*ux*oc-uy*st, uz*uy*oc+ux*st, ct+uz*uz*oc]
    ])
    return R

# Class definition
class MolecularCrystal:
    """
    Represents a molecular crystal for GPT tokenization and CIF generation.
    Attributes:
        space_group (int)
        lattice_params (dict): a b c alpha beta gamma
        com_frac (np.ndarray)
        rod (np.ndarray)
        selfies_tokens (list)
        tokens (list): GPT tokens
        local_coords (np.ndarray)
        atom_types (list)
        properties (dict): user-defined properties (e.g., energy)
    """
    def __init__(self, space_group, lattice_params, com_frac, rod, selfies_tokens, tokens = None, 
                 local_coords=None, atom_types=None,properties=None):
        self.space_group = int(space_group)
        self.lattice_params = dict(lattice_params)
        self.com_frac = np.array(com_frac)
        self.rod = np.array(rod)
        self.selfies_tokens = selfies_tokens
        self.local_coords = None if local_coords is None else np.array(local_coords)
        self.atom_types = None if atom_types is None else list(atom_types)
        self.tokens = self.get_crystal_tokens() if tokens is None else tokens
        # store custom properties
        self.properties = {} if properties is None else dict(properties)
    @classmethod
    def from_tokens(cls, tokens, properties=None):
        """
        Parse a token list (from get_crystal_tokens) to recover parameters.
        Local coords and atom_types must be set via set_molecule().
        """
        # join tokens and parse by tags
        text = ' '.join(tokens)
        def extract(tag):
            m = re.search(f'<{tag}>(.*?)</{tag}>', text)
            return m.group(1).split() if m else []
        # SELFIES
        selfies = extract('SELF')
        # SG
        sg_tok = extract('SG')[0]
        sg = int(sg_tok.replace('_sg',''))
        # Lattice
        lp = {}
        for tag in ['A','B','C','ALPHA','BETA','GAMMA']:
            seq = extract(tag)
            val = float(''.join(seq))
            key = tag.lower() if len(tag)==1 else tag.lower()
            lp[key] = val
        # CENTER
        com = []
        for tag in ['X','Y','Z']:
            seq = extract(tag)
            com.append(float(''.join(seq)))
        # ROTATION
        rod = []
        for tag in ['R0','R1','R2']:
            seq = extract(tag)
            rod.append(float(''.join(seq)))
        # Additional properties: LE and LE_HULL
        parsed_properties = {} if properties is None else dict(properties)
        for key in ['LE', 'LE_HULL']:
            val = extract(key)
            if val:
                try:
                    parsed_properties[key] = float(''.join(val))
                except ValueError:
                    pass  # silently skip if cannot convert

        return cls(space_group=sg, lattice_params=lp, com_frac=com, rod=rod,
                   selfies_tokens=selfies, tokens=tokens, properties=parsed_properties)
    @classmethod
    def from_token_ids(cls, token_ids, vocab=None, properties=None):
        """
        Create instance by decoding token_ids via vocab (auto-generated if None).
        """
        if vocab is None:
            vocab = cls.generate_vocab()
        # invert
        id2tok = {i:t for t,i in vocab.items()}
        tokens = [id2tok[i] for i in token_ids]
        return cls.from_tokens(tokens, properties=properties)
    
    def set_property(self, name, value):
        """Set a custom property, e.g., energy."""
        self.properties[name] = value

    def get_property(self, name, default=None):
        """Get a custom property."""
        return self.properties.get(name, default)
    
    def set_molecule(self, local_coords, atom_types):
        """
        Provide molecular local coordinates and atom types.
        """
        self.local_coords = np.array(local_coords)
        self.atom_types = list(atom_types)

    def get_crystal_tokens(self):
        """
        Build token list for GPT.
        """
        tokens = []
        tokens += ['<SELF>'] + self.selfies_tokens + ['</SELF>']
        tokens += ['<SG>', f'{self.space_group}_sg', '</SG>']
        
        for tag, key, prec in [('A','a',2),('B','b',2),('C','c',2),
                              ('ALPHA','alpha',1),('BETA','beta',1),('GAMMA','gamma',1)]:
            val = self.lattice_params[key]
            tokens += [f'<{tag}>'] + split_numeric(val, precision=prec) + [f'</{tag}>']
            
        for tag,index in zip(['X','Y','Z'], range(3)):
            tokens += [f'<{tag}>'] + split_numeric(self.com_frac[index], precision=3) + [f'</{tag}>']

        for tag,index in zip(['R0','R1','R2'], range(3)):
            tokens += [f'<{tag}>'] + split_numeric(self.rod[index], precision=2) + [f'</{tag}>']

        self.tokens = tokens
        return tokens
    
    @staticmethod
    def generate_vocab():
        """
        Return a token->ID mapping including:
         - SELFIES alphabet
         - domain tags
         - digits and symbols
        """
        # vocab, idx = {}, 0
        # selfies_alphabet = sf.get_semantic_robust_alphabet()
        # #  digits and symbols
        # for c in list('0123456789-.'):
        #     vocab[c] = idx; idx += 1
        # #  SELFIES
        # for tok in selfies_alphabet:
        #     vocab[tok] = idx; idx += 1

        # # Filtered space groups
        # for sg in SG_HALL.keys():
        #     vocab[f'{sg}_sg'] = idx
        #     idx += 1

        # #  Tags
        # tags = ['SELF','SG','A','B','C','ALPHA','BETA','GAMMA','X','Y','Z','R0','R1','R2','LE','LE_HULL']
        # for t in tags:
        #     vocab[f'<{t}>'] = idx; idx += 1
        #     vocab[f'</{t}>'] = idx; idx += 1

        # # PLACEHOLDER
        # vocab[f'<PH>'] = idx
        # return vocab
        return VOCAB
    
    @staticmethod
    def tokens_to_ids(tokens, vocab):
        """
        Map a list of tokens to integer IDs using provided vocab.
        """
        return [vocab[t] for t in tokens]  
      
    def get_token_ids(self):
        """
        Will gen vocab in real time, not recommended when high-throughput
        recommend: gen vocab , then tokens_to_ids()
        """
        vocab = self.generate_vocab()
        token_ids = self.tokens_to_ids(self.tokens , vocab)
        return token_ids


    def gen_cif(self, filename):
        """
        Generate a CIF file listing single molecule atom fractional coords and symmetry ops from sg_ops_text.
        sg_ops_text: dict mapping SG int to raw symmetry operations text.
        """
        if self.local_coords is None or self.atom_types is None:
            raise ValueError('Local coordinates and atom types not set')
        # reconstruct rotation matrix and lattice cell
        R = rodrigues_to_rotmat(self.rod)
        a,b,c = self.lattice_params['a'], self.lattice_params['b'], self.lattice_params['c']
        alpha,beta,gamma = self.lattice_params['alpha'], self.lattice_params['beta'], self.lattice_params['gamma']
        L = lattice_params_to_matrix(a, b, c,alpha,beta,gamma)
        com_cart = self.com_frac @ L 
        coords_m = (R @ self.local_coords.T).T + com_cart 
        coords_frac = cart_to_frac_numpy(coords_m, L)

        # write minimal CIF
        with open(filename,'w') as f:
            f.write(f"data_generated\n")
            f.write("_audit_creation_method generated by MolecularCrystal\n")
            f.write(f"_symmetry_Int_Tables_number {self.space_group}\n")
            f.write(f"_cell_length_a {a}\n")
            f.write(f"_cell_length_b {b}\n")
            f.write(f"_cell_length_c {c}\n")
            f.write(f"_cell_angle_alpha {alpha}\n")
            f.write(f"_cell_angle_beta {beta}\n")
            f.write(f"_cell_angle_gamma {gamma}\n")
            f.write("loop_\n_symmetry_equiv_pos_site_id\n_symmetry_equiv_pos_as_xyz")
            # insert symmetry operations text
            f.write(f"{SG_OPS_TEXT[self.space_group]}\n")
            f.write("loop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\n")

            for i,(sp,coord) in enumerate(zip(self.atom_types, coords_frac),1):
                f.write(f"{sp}{i} {sp} {coord[0]:.12f} {coord[1]:.12f} {coord[2]:.12f} 1.000000000000\n")
            f.write(f"#END")

    def to_cif_string(self) -> str:
        """
        Like gen_cif(), but returns the full CIF file contents as a string.
        """
        if self.local_coords is None or self.atom_types is None:
            raise ValueError('Local coordinates and atom types not set')

        # reconstruct rotation matrix and lattice cell
        R = rodrigues_to_rotmat(self.rod)
        a,b,c = self.lattice_params['a'], self.lattice_params['b'], self.lattice_params['c']
        alpha,beta,gamma = self.lattice_params['alpha'], self.lattice_params['beta'], self.lattice_params['gamma']
        L = lattice_params_to_matrix(a, b, c, alpha, beta, gamma)
        com_cart = self.com_frac @ L 
        coords_m = (R @ self.local_coords.T).T + com_cart 
        coords_frac = cart_to_frac_numpy(coords_m, L)

        buf = StringIO()
        w = buf.write

        w("data_generated\n")
        w("_audit_creation_method generated by MolecularCrystal\n")
        w(f"_symmetry_Int_Tables_number {self.space_group}\n")
        w(f"_cell_length_a {a}\n")
        w(f"_cell_length_b {b}\n")
        w(f"_cell_length_c {c}\n")
        w(f"_cell_angle_alpha {alpha}\n")
        w(f"_cell_angle_beta {beta}\n")
        w(f"_cell_angle_gamma {gamma}\n")
        w("loop_\n")
        w("_symmetry_equiv_pos_site_id\n")
        w("_symmetry_equiv_pos_as_xyz")
        # insert symmetry operations text
        w(SG_OPS_TEXT[self.space_group].rstrip() + "\n")
        w("loop_\n")
        w("_atom_site_label\n")
        w("_atom_site_type_symbol\n")
        w("_atom_site_fract_x\n")
        w("_atom_site_fract_y\n")
        w("_atom_site_fract_z\n")
        w("_atom_site_occupancy\n")

        for i, (sp, coord) in enumerate(zip(self.atom_types, coords_frac), start=1):
            x, y, z = coord
            w(f"{sp}{i} {sp} {x:.12f} {y:.12f} {z:.12f} 1.000000000000\n")

        w("#END\n")
        return buf.getvalue()
    

    def __repr__(self):
        return (f"MolecularCrystal(SG={self.space_group}, lattice={self.lattice_params}, com_frac={self.com_frac}, rod={self.rod})")




VOCAB = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "-": 10,
  ".": 11,
  "[=C-1]": 12,
  "[#Branch3]": 13,
  "[#B]": 14,
  "[Branch3]": 15,
  "[#Branch1]": 16,
  "[Branch2]": 17,
  "[=Ring3]": 18,
  "[#B-1]": 19,
  "[#N+1]": 20,
  "[=N-1]": 21,
  "[Cl]": 22,
  "[Branch1]": 23,
  "[#C+1]": 24,
  "[O-1]": 25,
  "[S]": 26,
  "[=P]": 27,
  "[N-1]": 28,
  "[#P]": 29,
  "[=O]": 30,
  "[O]": 31,
  "[Ring2]": 32,
  "[P]": 33,
  "[#O+1]": 34,
  "[=Ring1]": 35,
  "[#N]": 36,
  "[C]": 37,
  "[F]": 38,
  "[#S]": 39,
  "[B+1]": 40,
  "[=C]": 41,
  "[=C+1]": 42,
  "[=N]": 43,
  "[S-1]": 44,
  "[C-1]": 45,
  "[O+1]": 46,
  "[#C-1]": 47,
  "[Ring1]": 48,
  "[N+1]": 49,
  "[#S+1]": 50,
  "[#C]": 51,
  "[I]": 52,
  "[=P+1]": 53,
  "[=B+1]": 54,
  "[Br]": 55,
  "[#P+1]": 56,
  "[=S+1]": 57,
  "[=B]": 58,
  "[P+1]": 59,
  "[=Branch1]": 60,
  "[=P-1]": 61,
  "[C+1]": 62,
  "[S+1]": 63,
  "[B-1]": 64,
  "[Ring3]": 65,
  "[=Ring2]": 66,
  "[=B-1]": 67,
  "[=S-1]": 68,
  "[=Branch3]": 69,
  "[#S-1]": 70,
  "[B]": 71,
  "[=O+1]": 72,
  "[#P-1]": 73,
  "[=Branch2]": 74,
  "[#Branch2]": 75,
  "[=N+1]": 76,
  "[=S]": 77,
  "[N]": 78,
  "[P-1]": 79,
  "[H]": 80,
  "1_sg": 81,
  "2_sg": 82,
  "4_sg": 83,
  "5_sg": 84,
  "7_sg": 85,
  "9_sg": 86,
  "13_sg": 87,
  "14_sg": 88,
  "15_sg": 89,
  "18_sg": 90,
  "19_sg": 91,
  "20_sg": 92,
  "29_sg": 93,
  "33_sg": 94,
  "43_sg": 95,
  "56_sg": 96,
  "60_sg": 97,
  "61_sg": 98,
  "76_sg": 99,
  "86_sg": 100,
  "88_sg": 101,
  "96_sg": 102,
  "145_sg": 103,
  "148_sg": 104,
  "154_sg": 105,
  "169_sg": 106,
  "<SELF>": 107,
  "</SELF>": 108,
  "<SG>": 109,
  "</SG>": 110,
  "<A>": 111,
  "</A>": 112,
  "<B>": 113,
  "</B>": 114,
  "<C>": 115,
  "</C>": 116,
  "<ALPHA>": 117,
  "</ALPHA>": 118,
  "<BETA>": 119,
  "</BETA>": 120,
  "<GAMMA>": 121,
  "</GAMMA>": 122,
  "<X>": 123,
  "</X>": 124,
  "<Y>": 125,
  "</Y>": 126,
  "<Z>": 127,
  "</Z>": 128,
  "<R0>": 129,
  "</R0>": 130,
  "<R1>": 131,
  "</R1>": 132,
  "<R2>": 133,
  "</R2>": 134,
  "<LE>": 135,
  "</LE>": 136,
  "<LE_HULL>": 137,
  "</LE_HULL>": 138,
  "<PH>": 139
}

# Known symmetry operations per space group
SG_HALL = {
    1: 1,
    2: 2,
    4: 6,
    5: 9,
    7: 21,
    9: 39,
    13: 72,
    14: 81,
    15: 90,
    18: 112,
    19: 115,
    20: 116,
    29: 143,
    33: 164,
    43: 212,
    56: 266,
    60: 284,
    61: 290,
    76: 350,
    86: 362,
    88: 365,
    96: 373,
    145: 432,
    148: 436,
    154: 443,
    169: 463,
}

SG_OPS_TEXT = {
    1:"""
1 +x,+y,+z""",
    2:"""
1 -x,-y,-z
2 +x,+y,+z""",
    4:"""
1 +x,+y,+z
2 -x,1/2+y,-z""",
    5:"""
1 -x,+y,-z
2 +x,+y,+z
3 1/2-x,1/2+y,-z
4 1/2+x,1/2+y,+z""",
    7:"""
1 +x,+y,+z
2 +x,-y,1/2+z""",
    9:"""
1 +x,+y,+z
2 +x,-y,1/2+z
3 1/2+x,1/2+y,+z
4 1/2+x,1/2-y,1/2+z""",
    13:"""
1 -x,-y,-z
2 +x,+y,+z
3 -x,+y,1/2-z
4 +x,-y,1/2+z""",
    14: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,1/2+y,1/2-z
4 +x,1/2-y,1/2+z""",
    15: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,+y,1/2-z
4 +x,-y,1/2+z
5 1/2-x,1/2-y,-z
6 1/2+x,1/2+y,+z
7 1/2-x,1/2+y,1/2-z
8 1/2+x,1/2-y,1/2+z""",
    18: """
1 -x,-y,+z
2 +x,+y,+z
3 1/2-x,1/2+y,-z
4 1/2+x,1/2-y,-z""",
    19: """
1 +x,+y,+z
2 -x,1/2+y,1/2-z
3 1/2-x,-y,1/2+z
4 1/2+x,1/2-y,-z""",
    20: """
1 +x,-y,-z
2 +x,+y,+z
3 -x,-y,1/2+z
4 -x,+y,1/2-z
5 1/2+x,1/2-y,-z
6 1/2+x,1/2+y,+z
7 1/2-x,1/2-y,1/2+z
8 1/2-x,1/2+y,1/2-z""",
    29: """
1 +x,+y,+z
2 -x,-y,1/2+z
3 1/2+x,-y,+z
4 1/2-x,+y,1/2+z""",
    33: """
1 +x,+y,+z
2 -x,-y,1/2+z
3 1/2+x,1/2-y,+z
4 1/2-x,1/2+y,1/2+z""",
    43: """
1 -x,-y,+z
2 +x,+y,+z
3 -x,1/2-y,1/2+z
4 +x,1/2+y,1/2+z
5 1/4-x,1/4+y,1/4+z
6 1/4+x,1/4-y,1/4+z
7 1/4-x,3/4+y,3/4+z
8 1/4+x,3/4-y,3/4+z
9 1/2-x,-y,1/2+z
10 1/2+x,+y,1/2+z
11 1/2-x,1/2-y,+z
12 1/2+x,1/2+y,+z
13 3/4-x,1/4+y,3/4+z
14 3/4+x,1/4-y,3/4+z
15 3/4-x,3/4+y,1/4+z
16 3/4+x,3/4-y,1/4+z""",
    56: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,1/2+y,1/2-z
4 +x,1/2-y,1/2+z
5 1/2-x,+y,1/2+z
6 1/2+x,-y,1/2-z
7 1/2-x,1/2-y,+z
8 1/2+x,1/2+y,-z""",
    60: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,+y,1/2-z
4 +x,-y,1/2+z
5 1/2-x,1/2+y,+z
6 1/2+x,1/2-y,-z
7 1/2-x,1/2-y,1/2+z
8 1/2+x,1/2+y,1/2-z""",
    61: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,1/2+y,1/2-z
4 +x,1/2-y,1/2+z
5 1/2-x,-y,1/2+z
6 1/2+x,+y,1/2-z
7 1/2-x,1/2+y,+z
8 1/2+x,1/2-y,-z""",
    76: """
1 +x,+y,+z
2 -y,+x,1/4+z
3 -x,-y,1/2+z
4 +y,-x,3/4+z""",
    86: """
1 -x,-y,-z
2 +x,+y,+z
3 -y,1/2+x,1/2+z
4 +y,1/2-x,1/2-z
5 1/2-y,+x,1/2-z
6 1/2+y,-x,1/2+z
7 1/2-x,1/2-y,+z
8 1/2+x,1/2+y,-z""",
    88: """
1 -x,-y,-z
2 +x,+y,+z
3 -x,1/2-y,+z
4 +x,1/2+y,-z
5 1/4-y,1/4+x,1/4-z
6 1/4+y,1/4-x,1/4+z
7 1/4-y,3/4+x,3/4+z
8 1/4+y,3/4-x,3/4-z
9 1/2-x,-y,1/2+z
10 1/2+x,+y,1/2-z
11 1/2-x,1/2-y,1/2-z
12 1/2+x,1/2+y,1/2+z
13 3/4-y,1/4+x,1/4+z
14 3/4+y,1/4-x,1/4-z
15 3/4-y,3/4+x,3/4-z
16 3/4+y,3/4-x,3/4+z""",
    96: """
1 +y,+x,-z
2 +x,+y,+z
3 -x,-y,1/2+z
4 -y,-x,1/2-z
5 1/2+y,1/2-x,1/4+z
6 1/2+x,1/2-y,1/4-z
7 1/2-x,1/2+y,3/4-z
8 1/2-y,1/2+x,3/4+z""",
    145: """
1 +x,+y,+z
2 -x+y,-x,1/3+z
3 -y,+x-y,2/3+z""",
    148: """
1 -x,-y,-z
2 -x+y,-x,+z
3 -y,+x-y,+z
4 +y,-x+y,-z
5 +x-y,+x,-z
6 +x,+y,+z
7 1/3-x,2/3-y,2/3-z
8 1/3-x+y,2/3-x,2/3+z
9 1/3-y,2/3+x-y,2/3+z
10 1/3+y,2/3-x+y,2/3-z
11 1/3+x-y,2/3+x,2/3-z
12 1/3+x,2/3+y,2/3+z
13 2/3-x,1/3-y,1/3-z
14 2/3-x+y,1/3-x,1/3+z
15 2/3-y,1/3+x-y,1/3+z
16 2/3+y,1/3-x+y,1/3-z
17 2/3+x-y,1/3+x,1/3-z
18 2/3+x,1/3+y,1/3+z""",
    154: """
1 +y,+x,-z
2 +x,+y,+z
3 -x+y,-x,1/3+z
4 +x-y,-y,1/3-z
5 -x,-x+y,2/3-z
6 -y,+x-y,2/3+z""",
    169: """
1 +x,+y,+z
2 +x-y,+x,1/6+z
3 -y,+x-y,1/3+z
4 -x,-y,1/2+z
5 -x+y,-x,2/3+z
6 +y,-x+y,5/6+z""",
    
}