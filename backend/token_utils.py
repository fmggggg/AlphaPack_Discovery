from typing import Dict, Any, Tuple
from .mc_adapter import build_mc_from_tokens

def parse_one_item(name: str, obj: Dict[str, Any], energy_key: str, density_key: str | None,
                   atom_types: list[str], local_coords, compute_density_cb) -> Tuple[Dict[str, Any], str | None]:
    """
    返回 (meta, warn)；meta 至少包含: name, energy, density(若能获得), a,b,c,alpha,beta,gamma, sg, com, rod
    """
    tokens = obj.get("tokens")
    if not tokens:
        return {}, f"{name}: missing 'tokens'"

    # energy（必需）
    if energy_key not in obj:
        return {}, f"{name}: missing energy_key '{energy_key}'"
    energy = obj[energy_key]

    # 构建 MC，抽取晶胞与几何（不做昂贵计算）
    mc = build_mc_from_tokens(tokens, atom_types, local_coords, extra={k:v for k,v in obj.items() if k!="tokens"})
    lp = mc.lattice_params
    sg = mc.space_group
    com = [float(x) for x in mc.com_frac]
    rod = [float(x) for x in mc.rod]

    # density（若 density_key 存在就用；否则尝试计算）
    density = None
    if density_key and (density_key in obj):
        density = obj[density_key]
    else:
        try:
            density = compute_density_cb(tokens, atom_types, local_coords, extra={k:v for k,v in obj.items() if k!="tokens"})
        except Exception as e:
            density = None  # 失败则先留空

    meta = {
        "name": name,
        "energy": float(energy),
        "density": None if density is None else float(density),
        "sg": int(sg),
        "a": float(lp["a"]), "b": float(lp["b"]), "c": float(lp["c"]),
        "alpha": float(lp["alpha"]), "beta": float(lp["beta"]), "gamma": float(lp["gamma"]),
        "com": com, "rod": rod,
    }
    # 附带原始条目的其他字段（除 tokens）
    for k,v in obj.items():
        if k != "tokens" and k not in meta:
            meta[k] = v
    return meta, None
