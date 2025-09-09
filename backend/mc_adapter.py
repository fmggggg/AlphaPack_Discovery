import numpy as np
from typing import Tuple, Dict, Any

from .org_crystal import MolecularCrystal  
import selfies as sf
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

def extract_selfies_from_tokens(tokens: list[str] | None) -> str | None:
    """从 token 序列中抽取 <SELF>...</SELF> 段，拼成 selfies 字符串。"""
    if not tokens or not isinstance(tokens, list):
        return None
    try:
        i0 = tokens.index("<SELF>")
        i1 = tokens.index("</SELF>")
        if i1 <= i0 + 1:
            return None
        # SELFIES 规范是无分隔的连续标记，如 [C][H][O]...
        selfies_tokens = tokens[i0 + 1 : i1]
        return "".join(t for t in selfies_tokens if isinstance(t, str))
    except ValueError:
        return None

def selfies_to_smiles(selfies_str: str | None) -> str | None:
    """将 selfies 转为 smiles。环境未装 selfies 或解析失败时返回 None。"""
    if not selfies_str or sf is None:
        return None
    try:
        return sf.decoder(selfies_str)
    except Exception:
        return None