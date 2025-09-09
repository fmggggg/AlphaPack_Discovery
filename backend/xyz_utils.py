import numpy as np

def parse_xyz(text: str):
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    # 兼容带头部的 xyz；若无头部，则直接解析所有行
    try:
        n = int(lines[0])
        data_lines = lines[2:2+n]
    except ValueError:
        data_lines = lines
    atom_types, coords = [], []
    for ln in data_lines:
        parts = ln.split()
        if len(parts) < 4: 
            continue
        atom_types.append(parts[0])
        coords.append([float(parts[1]), float(parts[2]), float(parts[3])])
    return atom_types, np.array(coords, dtype=float)
