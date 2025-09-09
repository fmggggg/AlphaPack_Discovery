import numpy as np
from typing import Tuple, Dict, Any

from .org_crystal import MolecularCrystal  

from pymatgen.core import Structure

def build_mc_from_tokens(tokens: list[str], atom_types: list[str], local_coords: np.ndarray, extra: Dict[str, Any] | None=None):
    mc = MolecularCrystal.from_tokens(tokens, properties=extra or {})
    mc.set_molecule(local_coords=local_coords, atom_types=atom_types)
    return mc

def cif_text_from_mc(mc: "MolecularCrystal") -> str:
    return mc.to_cif_string()

def compute_density_g_cm3_from_cif_text(cif_text: str) -> float:
    # 让 pymatgen 解析 CIF；CifParser/Structure.from_str 会应用对称操作
    s = Structure.from_str(cif_text, fmt="cif")
    return float(s.density)  # g/cm^3

def compute_density_for_item(tokens: list[str], atom_types: list[str], local_coords: np.ndarray, extra: Dict[str, Any] | None=None) -> float:
    mc = build_mc_from_tokens(tokens, atom_types, local_coords, extra)
    cif_text = cif_text_from_mc(mc)
    return compute_density_g_cm3_from_cif_text(cif_text)
