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
from .mc_adapter import compute_density_for_item, build_mc_from_tokens, cif_text_from_mc
from .token_utils import parse_one_item


app = FastAPI(title="OMC-Lite (Tokens) API")

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

# ---------- Upload dataset: molecule.xyz + structures.json ----------
@app.post("/api/datasets/upload")
async def upload_dataset(
    molecule: UploadFile = File(...),
    structures: UploadFile = File(...),
    energy_key: str = Form(...),          # 必填：告诉我们 energy 的键名
    density_key: str | None = Form(None), # 可选：密度键名；缺失则尝试计算
    dataset: str | None = Form(None),     # 可选：数据集名
):
    dsid = dataset or str(uuid.uuid4())

    # 1) 保存原文件
    mol_bytes = await molecule.read()
    toks_bytes = await structures.read()
    save_bytes(f"datasets/{dsid}/molecule.xyz", mol_bytes)
    save_bytes(f"datasets/{dsid}/structures.json", toks_bytes)

    # 2) 解析 molecule
    atom_types, local_coords = parse_xyz(mol_bytes.decode("utf-8"))
    save_json(f"datasets/{dsid}/molecule.json", {"atom_types": atom_types, "local_coords": local_coords.tolist()})

    # 3) 解析 structures.json → manifest（抽取 energy/density/晶胞参数等）
    payload = json.loads(toks_bytes.decode("utf-8"))
    if not isinstance(payload, dict):
        raise HTTPException(400, detail="structures.json 格式错误：应为 {name: {tokens,...}} 的字典")

    manifest: List[Dict[str, Any]] = []
    warns: List[str] = []

    def _compute_density(tokens, atom_types, local_coords, extra):
        return compute_density_for_item(tokens, atom_types, local_coords, extra)

    for name, obj in payload.items():
        meta, warn = parse_one_item(
            name=name, obj=obj, energy_key=energy_key, density_key=density_key,
            atom_types=atom_types, local_coords=local_coords, compute_density_cb=_compute_density
        )
        if warn:
            warns.append(warn)
            continue
        # 简易化学式（基元分子的元素统计）
        formula = Counter(atom_types)
        meta["formula"] = "".join(f"{el}{cnt if cnt>1 else ''}" for el,cnt in formula.items())
        manifest.append(meta)

    save_json(f"datasets/{dsid}/manifest.json", manifest)
    save_json(f"datasets/{dsid}/meta.json", {
        "dsid": dsid,
        "title": dataset or dsid,
        "count": len(manifest),
        "created_at": datetime.utcnow().isoformat()+"Z",
        "energy_key": energy_key,
        "density_key": density_key,
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
    return load_json(f"datasets/{dsid}/manifest.json")

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
    tokens_json = load_json(f"datasets/{dsid}/structures.json")
    item = tokens_json.get(name)
    if not item:
        raise HTTPException(404, "name not found")

    mol = load_json(f"datasets/{dsid}/molecule.json")
    mc = build_mc_from_tokens(item["tokens"], mol["atom_types"], np.array(mol["local_coords"]), extra={k:v for k,v in item.items() if k!="tokens"})
    cif_text = cif_text_from_mc(mc)
    return Response(content=cif_text, media_type="text/plain")
