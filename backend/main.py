from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from typing import List, Dict, Any
from datetime import datetime
import uuid, json, numpy as np
from collections import Counter

from .settings import settings
from .store import save_bytes, save_json, load_json, load_text, exists, list_dataset_meta_paths
from .xyz_utils import parse_xyz
from .mc_adapter import compute_density_for_item, build_mc_from_tokens, cif_text_from_mc, extract_selfies_from_tokens, selfies_to_smiles, create_rdkit_mol_from_coords
from .token_utils import parse_one_item
from .routers import leaderboard
# ====== optional deps for smiles/selfies ======
try:
    import selfies as sf
except Exception:
    sf = None
try:
    from rdkit import Chem
except Exception:
    Chem = None
try:
    from pymatgen.core import Structure as PMGStructure
except Exception:
    PMGStructure = None
import uuid, json, numpy as np, io, csv, zipfile, re, math
from typing import List, Dict, Any, Optional, Tuple
from pathlib import PurePosixPath


app = FastAPI(title="AlphaPack API")
app.include_router(leaderboard.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat()+"Z"}

def smiles_selfies_from_xyz(atom_types: list[str], coords: np.ndarray) -> tuple[str | None, str | None]:
    smiles = None
    selfies_str = None
    try:
        mol = create_rdkit_mol_from_coords(coords, atom_types)  # 你的函数
        if Chem is not None:
            smiles = Chem.MolToSmiles(mol)
        if smiles and sf is not None:
            try:
                selfies_str = sf.encoder(smiles)
            except Exception:
                selfies_str = None
    except Exception:
        pass
    return smiles, selfies_str

# ---------- helpers: CIF handling for CIF-upload mode ----------
_SPLIT_END = re.compile(r'^\s*#END\s*$', re.IGNORECASE)
_CELL_NUM = re.compile(r'_(?:cell_length_a|cell_length_b|cell_length_c)\s+([\-+0-9.eE]+)', re.IGNORECASE)
_CELL_A = re.compile(r'_cell_length_a\s+([\-+0-9.eE]+)', re.IGNORECASE)
_CELL_B = re.compile(r'_cell_length_b\s+([\-+0-9.eE]+)', re.IGNORECASE)
_CELL_C = re.compile(r'_cell_length_c\s+([\-+0-9.eE]+)', re.IGNORECASE)
_ANG_A = re.compile(r'_cell_angle_alpha\s+([\-+0-9.eE]+)', re.IGNORECASE)
_ANG_B = re.compile(r'_cell_angle_beta\s+([\-+0-9.eE]+)', re.IGNORECASE)
_ANG_C = re.compile(r'_cell_angle_gamma\s+([\-+0-9.eE]+)', re.IGNORECASE)
_SG_INT = re.compile(r'_symmetry_Int_Tables_number\s+([0-9]+)', re.IGNORECASE)

def _parse_cell_sg(cif_text: str) -> Dict[str, Any]:
    def _get(pat, default=None):
        m = pat.search(cif_text)
        return float(m.group(1)) if m else default
    a = _get(_CELL_A); b = _get(_CELL_B); c = _get(_CELL_C)
    alpha = _get(_ANG_A); beta = _get(_ANG_B); gamma = _get(_ANG_C)
    sg = None
    m = _SG_INT.search(cif_text)
    if m:
        sg = int(m.group(1))
    return {
        "sg": sg,
        "cell": None if None in (a,b,c,alpha,beta,gamma) else {
            "a": a, "b": b, "c": c, "alpha": alpha, "beta": beta, "gamma": gamma
        }
    }

def _split_multi_cif(big: str) -> List[Tuple[str, str]]:
    """按 #END 分块，块第一行作为名字（原样去空白）。"""
    out: List[Tuple[str, str]] = []
    buf: List[str] = []
    name: Optional[str] = None
    for line in big.splitlines(True):
        if not buf:
            name = line.strip()
        buf.append(line)
        if _SPLIT_END.match(line):
            block = "".join(buf)
            if name:
                out.append((name, block))
            buf, name = [], None
    # 如果最后一块没有 #END，不保存（或按需保存）
    return out

def _read_zip_cifs(zb: bytes) -> List[Tuple[str, str]]:
    """
    读取 .zip 中的所有 .cif 文件。
    返回列表 [(name_without_ext, cif_text), ...]
    - name 使用压缩包内文件的“文件名（不含扩展名）”
    - 兼容子目录，如 'sub/dir/a.cif' -> name='a'
    """
    out: List[Tuple[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(zb)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            fn = info.filename  # ZIP 内部统一使用 POSIX 风格路径
            if not fn.lower().endswith(".cif"):
                continue

            # 取 basename 并去掉 .cif 扩展
            base = PurePosixPath(fn).name      # e.g. "a.cif"
            name = base[:-4]                   # 去掉最后 4 个字符 ".cif"

            # 读取并尽量用 utf-8 解码，失败再回退 latin-1
            raw = zf.read(info)
            try:
                txt = raw.decode("utf-8")
            except UnicodeDecodeError:
                txt = raw.decode("latin-1", errors="ignore")

            out.append((name.strip(), txt))
    return out

def _read_energy_csv(csv_bytes: bytes, name_col: str, energy_col: str, density_col: Optional[str]) -> Dict[str, Dict[str, Optional[float]]]:
    m = {}
    f = io.StringIO(csv_bytes.decode("utf-8", errors="ignore"))
    reader = csv.DictReader(f)
    if name_col not in reader.fieldnames or energy_col not in reader.fieldnames:
        raise HTTPException(400, detail=f"CSV must contain columns: {name_col}, {energy_col}")
    for row in reader:
        nm = (row.get(name_col) or "").strip()
        if not nm: continue
        try:
            e = float(row.get(energy_col))
        except Exception:
            continue
        dval = None
        if density_col and row.get(density_col) not in (None, ""):
            try:
                dval = float(row[density_col])
            except Exception:
                dval = None
        m[nm] = {"energy": e, "density": dval}
    return m

def density_from_cif(cif_text: str) -> float | None:
    """
    Try compute density (g/cm^3) from a CIF string.
    Prefers pymatgen if available. Returns None on failure.
    """
    if PMGStructure is not None:
        try:
            s = PMGStructure.from_str(cif_text, fmt="cif")
            # pymatgen's Structure.density is already in g/cm^3
            return float(s.density)
        except Exception:
            pass
    # TODO: could add a gemmi-based fallback here if needed
    return None

def _first_nonempty_line(text: str) -> str:
    for ln in text.splitlines():
        s = ln.strip()
        if s:
            return s
    return ""

_ID_PREFIX = re.compile(r"^(data[_\-]+)", re.IGNORECASE)

def _norm_id(s: str) -> str:
    """
    规范化用于匹配的 id：
    - 去掉前缀 data_ / data-
    - 去除首尾空白
    - 小写
    """
    if not s:
        return ""
    s = s.strip()
    s = _ID_PREFIX.sub("", s)
    return s.lower()

def _read_zip_cifs(zb: bytes) -> list[dict]:
    """
    返回形如：
    [{ "header": <cif第一行>, "text": <cif全文>, "file_stem": <去扩展名文件名> }, ...]
    """
    out = []
    with zipfile.ZipFile(io.BytesIO(zb)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            fn = info.filename
            if not fn.lower().endswith(".cif"):
                continue
            base = PurePosixPath(fn).name  # e.g. "adaree-1.cif"
            file_stem = base[:-4]          # 去掉 ".cif"
            raw = zf.read(info)
            try:
                txt = raw.decode("utf-8")
            except UnicodeDecodeError:
                txt = raw.decode("latin-1", errors="ignore")
            out.append({
                "header": _first_nonempty_line(txt),
                "text": txt,
                "file_stem": file_stem.strip(),
            })
    return out

def _split_multi_cif(big: str) -> list[dict]:
    items = []
    buf = []
    for line in big.splitlines(True):
        buf.append(line)
        if _SPLIT_END.match(line):
            block = "".join(buf)
            items.append({
                "header": _first_nonempty_line(block),
                "text": block,
                "file_stem": None,  # 大CIF没有文件名
            })
            buf = []
    # 无 #END 的尾块可按需处理；这里不加入
    return items

def _associate_cifs_to_csv(cif_entries: list[dict], en_map: dict[str, dict]) -> tuple[list[tuple[str, dict]], list[str]]:
    """
    返回：
      matches: [(csv_name, cif_entry), ...]
      warns:   [warn strings]
    匹配优先级：
      3：完全相等（header_norm == csv_norm 或 file_norm == csv_norm）
      2：包含关系（header_norm 包含 csv_norm）
    """
    warns = []
    used = set()
    results = []

    # 预先规范化
    normalized = []
    for idx, ent in enumerate(cif_entries):
        h = _norm_id(ent.get("header", ""))
        f = _norm_id(ent.get("file_stem") or "")
        normalized.append((idx, h, f))

    for csv_name in en_map.keys():
        cn = _norm_id(csv_name)
        best = (-1, -1)  # (score, idx)
        for idx, h, f in normalized:
            if idx in used:
                continue
            score = -1
            if cn and (h == cn or (f and f == cn)):
                score = 3
            elif cn and cn in h:
                score = 2
            if score > best[0]:
                best = (score, idx)
                if score == 3:
                    break
        if best[0] < 0:
            warns.append(f"cif chunk not found for name '{csv_name}' (match by header)")
            continue
        used.add(best[1])
        results.append((csv_name, cif_entries[best[1]]))
    return results, warns

# ---------- Upload dataset: tokens-mode OR cif-mode ----------
@app.post("/api/datasets/upload")
async def upload_dataset(
    # common
    molecule: UploadFile = File(...),
    dataset: str | None = Form(None),

    # tokens-mode (old)
    structures: UploadFile | None = File(None),
    energy_key: str | None = Form(None),
    density_key: str | None = Form(None),

    # mode switch
    upload_mode: str = Form("tokens"),  # "tokens" | "cif"

    # cif-mode (new)
    cif_bundle: UploadFile | None = File(None),     # big .cif with #END
    cif_zip: UploadFile | None = File(None),        # .zip of many .cif
    energy_csv: UploadFile | None = File(None),     # CSV with name,energy[,density]
    name_col: str = Form("name"),
    energy_col: str = Form("energy"),
    density_col: str | None = Form("density"),
):
    dsid = dataset or str(uuid.uuid4())

    # 1) save molecule.xyz
    mol_bytes = await molecule.read()
    save_bytes(f"datasets/{dsid}/molecule.xyz", mol_bytes)
    atom_types, local_coords = parse_xyz(mol_bytes.decode("utf-8"))
    save_json(f"datasets/{dsid}/molecule.json", {
        "atom_types": atom_types, "local_coords": local_coords.tolist()
    })

    # Attempt SMILES/SELFIES from xyz (optional)
    smiles, selfies_str = smiles_selfies_from_xyz(atom_types, np.array(local_coords))
    warns: List[str] = []

    if upload_mode == "tokens":
        # ========= OLD MODE (tokens) =========
        if structures is None or energy_key is None:
            raise HTTPException(400, "tokens mode requires structures.json and energy_key")
        toks_bytes = await structures.read()
        save_bytes(f"datasets/{dsid}/structures.json", toks_bytes)

        payload = json.loads(toks_bytes.decode("utf-8"))
        if not isinstance(payload, dict):
            raise HTTPException(400, "structures.json should be a dict {name: {tokens,...}}")

        manifest: List[Dict[str, Any]] = []
        

        def _compute_density(tokens, atom_types, local_coords, extra):
            return compute_density_for_item(tokens, atom_types, local_coords, extra)

        for name, obj in payload.items():
            meta, warn = parse_one_item(
                name=name, obj=obj, energy_key=energy_key, density_key=density_key,
                atom_types=atom_types, local_coords=np.array(local_coords),
                compute_density_cb=_compute_density
            )
            if warn:
                warns.append(warn)
                continue
            # fill selfies/smiles 
            if selfies_str: meta["selfies"] = selfies_str
            if smiles:  meta["smiles"] = smiles
            manifest.append(meta)

        save_json(f"datasets/{dsid}/manifest.json", manifest)
        save_json(f"datasets/{dsid}/meta.json", {
            "dsid": dsid, "title": dataset or dsid, "count": len(manifest),
            "created_at": datetime.utcnow().isoformat()+"Z",
            "mode": "tokens",
            "energy_key": energy_key, "density_key": density_key,
            "smiles": smiles, "selfies": selfies_str,
            "warnings": warns,
        })
        return {"dsid": dsid, "count": len(manifest), "warnings": warns}

    # ========= NEW MODE (cif) =========
    if energy_csv is None:
        raise HTTPException(400, "cif mode requires energy_csv")
    csv_bytes = await energy_csv.read()
    save_bytes(f"datasets/{dsid}/energy.csv", csv_bytes)
    en_map = _read_energy_csv(csv_bytes, name_col, energy_col, density_col)

    # 统一读取为“条目对象”
    cif_entries = []
    if cif_zip is not None:
        zb = await cif_zip.read()
        save_bytes(f"datasets/{dsid}/cifs.zip", zb)
        cif_entries = _read_zip_cifs(zb)
    elif cif_bundle is not None:
        big = (await cif_bundle.read()).decode("utf-8", errors="ignore")
        save_bytes(f"datasets/{dsid}/all.cif", big.encode("utf-8"))
        cif_entries = _split_multi_cif(big)

    if not cif_entries:
        raise HTTPException(400, "no cif entries found")

    # 以 CSV 名匹配 CIF 条目
    pairs, warns_match = _associate_cifs_to_csv(cif_entries, en_map)
    warns.extend(warns_match)

    structures: Dict[str, Dict[str, Any]] = {}
    manifest: List[Dict[str, Any]] = []

    for csv_name, ent in pairs:
        ed = en_map.get(csv_name)
        if ed is None:
            warns.append(f"energy row missing for {csv_name}, skipped")
            continue

        cif_txt = ent["text"]
        energy = float(ed["energy"])
        density = float(ed["density"]) if ed["density"] is not None else None

        # 缺密度就从 CIF 计算
        if density is None:
            dcalc = density_from_cif(cif_txt)
            if dcalc is not None and math.isfinite(dcalc):
                density = float(dcalc)
            else:
                warns.append(f"density missing and cannot be computed for {csv_name}")

        meta_cd = _parse_cell_sg(cif_txt)

        m = {
            "name": csv_name,  # ← 以 CSV 名为准
            "energy": energy,
            "density": density,
            "sg": meta_cd.get("sg"),
            "cell": meta_cd.get("cell"),
            "smiles": smiles,
            "selfies": selfies_str,
        }
        manifest.append(m)

        structures[csv_name] = {
            "cif": cif_txt,
            "energy": energy,
            "density": density,
        }

    save_json(f"datasets/{dsid}/structures.json", structures)
    save_json(f"datasets/{dsid}/manifest.json", manifest)
    save_json(f"datasets/{dsid}/meta.json", {
        "dsid": dsid, "title": dataset or dsid, "count": len(manifest),
        "created_at": datetime.utcnow().isoformat()+"Z",
        "mode": "cif",
        "name_col": name_col, "energy_col": energy_col, "density_col": density_col,
        "smiles": smiles, "selfies": selfies_str,
        "warnings": warns,
    })

    return {"dsid": dsid, "count": len(manifest), "warnings": warns}

# -------- 数据集列表（用于左侧列表 + 搜索） --------
@app.get("/api/datasets")
def list_datasets():
    metas = []
    for meta_path in list_dataset_meta_paths():
        try:
            meta = load_json(meta_path)
            metas.append({
                "dsid": meta.get("dsid"),
                "title": meta.get("title", meta.get("dsid")),
                "count": meta.get("count", 0),
                "created_at": meta.get("created_at"),
                "mode": meta.get("mode"), 
            })
        except Exception:
            continue
    # 按时间降序
    metas.sort(key=lambda m: m.get("created_at") or "", reverse=True)
    return metas



# ---------- Manifest ----------
@app.get("/api/datasets/{dsid}/manifest")
def get_manifest(dsid: str):
    if not exists(f"datasets/{dsid}/manifest.json"):
        raise HTTPException(404, "dataset not found")
    manifest = load_json(f"datasets/{dsid}/manifest.json")

    # 向后兼容：补写 selfies/smiles
    needs_save = False
    try:
        tokens_json = load_json(f"datasets/{dsid}/structures.json")
    except Exception:
        tokens_json = {}

    for m in manifest:
        has_selfies = bool(m.get("selfies"))
        has_smiles  = bool(m.get("smiles"))
        if has_selfies and has_smiles:
            continue
        item = tokens_json.get(m.get("name")) if isinstance(tokens_json, dict) else None
        selfies_str = None
        if item and isinstance(item, dict):
            selfies_str = extract_selfies_from_tokens(item.get("tokens"))
        smiles_str = selfies_to_smiles(selfies_str) if selfies_str and not has_smiles else None

        if selfies_str and not has_selfies:
            m["selfies"] = selfies_str
            needs_save = True
        if smiles_str and not has_smiles:
            m["smiles"] = smiles_str
            needs_save = True

    if needs_save:
        save_json(f"datasets/{dsid}/manifest.json", manifest)

    return manifest


# ---------- Landscape: X=density, Y=energy ----------
@app.get("/api/datasets/{dsid}/landscape")
def dataset_landscape(dsid: str):
    if not exists(f"datasets/{dsid}/manifest.json"):
        raise HTTPException(404, "dataset not found")
    manifest = load_json(f"datasets/{dsid}/manifest.json")
    pts = []
    for m in manifest:
        energy = m.get("energy", None)
        density = m.get("density", None)
        if energy is None:
            # 没能解析出 energy 的条目直接跳过（energy 必须）
            continue
        if density is None:
            # 最后一次尝试：即时计算密度并缓存回 manifest（避免重复）
            try:
                mol = load_json(f"datasets/{dsid}/molecule.json")
                tokens_json = load_json(f"datasets/{dsid}/structures.json")
                obj = tokens_json[m["name"]]
                d = compute_density_for_item(obj["tokens"], mol["atom_types"], np.array(mol["local_coords"]), extra={k:v for k,v in obj.items() if k!="tokens"})
                m["density"] = float(d)
                save_json(f"datasets/{dsid}/manifest.json", manifest)
                density = m["density"]
            except Exception:
                continue
        pts.append({
            "id": m["name"],
            "name": m["name"],
            "x": float(density),
            "y": float(energy),
            "label": m.get("formula", m["name"]),
        })
    return pts

# ---------- CIF on demand ----------
@app.get("/api/crystals/{dsid}/{name}/cif")
def crystal_cif(dsid: str, name: str, expand: bool = False):
    if not exists(f"datasets/{dsid}/structures.json"):
        raise HTTPException(404, "dataset not found")
    data = load_json(f"datasets/{dsid}/structures.json")
    item = data.get(name)
    if not item:
        raise HTTPException(404, "name not found")

    # NEW MODE: structures[name] = { "cif": "...", ... }
    if isinstance(item, dict) and "cif" in item:
        return Response(content=item["cif"], media_type="text/plain")

    # OLD MODE: structures.json 是 tokens 大字典
    mol = load_json(f"datasets/{dsid}/molecule.json")
    mc = build_mc_from_tokens(item["tokens"], mol["atom_types"], np.array(mol["local_coords"]),
                              extra={k:v for k,v in item.items() if k!="tokens"})
    cif_text = cif_text_from_mc(mc)
    return Response(content=cif_text, media_type="text/plain")
