import os, json
from pathlib import Path
from typing import Any, List
from .settings import settings

DATA_ROOT = Path(settings.DATA_ROOT)

# ---------- Local FS ----------
def _local_save_bytes(path: str, data: bytes):
    p = DATA_ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)

def _local_load_text(path: str) -> str:
    p = DATA_ROOT / path
    return p.read_text(encoding="utf-8")

def _local_save_json(path: str, obj: Any):
    _local_save_bytes(path, json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8"))

def _local_load_json(path: str) -> Any:
    return json.loads(_local_load_text(path))

def _local_exists(path: str) -> bool:
    return (DATA_ROOT / path).exists()

def _local_list_dataset_meta_paths() -> List[str]:
    base = DATA_ROOT / "datasets"
    if not base.exists():
        return []
    paths = []
    for d in base.iterdir():
        if d.is_dir() and (d / "meta.json").exists():
            rel = f"datasets/{d.name}/meta.json"
            paths.append(rel)
    return paths

# ---------- Azure Blob ----------
_bsc = _cc = None
if settings.USE_AZURE_BLOB:
    from azure.storage.blob import BlobServiceClient
    from azure.identity import DefaultAzureCredential
    account = settings.AZURE_STORAGE_ACCOUNT
    assert account, "AZURE_STORAGE_ACCOUNT is required when USE_AZURE_BLOB=1"
    url = f"https://{account}.blob.core.windows.net"
    cred = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    _bsc = BlobServiceClient(url, credential=cred)
    _cc = _bsc.get_container_client(settings.AZURE_STORAGE_CONTAINER)
    try:
        _cc.create_container()
    except Exception:
        pass

def _blob_save_bytes(path: str, data: bytes):
    _cc.upload_blob(path, data, overwrite=True)

def _blob_load_text(path: str) -> str:
    return _cc.download_blob(path).content_as_text(encoding="utf-8")

def _blob_save_json(path: str, obj: Any):
    _blob_save_bytes(path, json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8"))

def _blob_load_json(path: str) -> Any:
    return json.loads(_blob_load_text(path))

def _blob_exists(path: str) -> bool:
    try:
        _cc.get_blob_client(path).get_blob_properties()
        return True
    except Exception:
        return False

def _blob_list_dataset_meta_paths() -> List[str]:
    paths = []
    for b in _cc.list_blobs(name_starts_with="datasets/"):
        if b.name.endswith("/meta.json"):
            paths.append(b.name)
    return paths

# ---------- public API ----------
def save_bytes(path: str, data: bytes):
    return _blob_save_bytes(path, data) if settings.USE_AZURE_BLOB else _local_save_bytes(path, data)

def load_text(path: str) -> str:
    return _blob_load_text(path) if settings.USE_AZURE_BLOB else _local_load_text(path)

def save_json(path: str, obj: Any):
    return _blob_save_json(path, obj) if settings.USE_AZURE_BLOB else _local_save_json(path, obj)

def load_json(path: str) -> Any:
    return _blob_load_json(path) if settings.USE_AZURE_BLOB else _local_load_json(path)

def exists(path: str) -> bool:
    return _blob_exists(path) if settings.USE_AZURE_BLOB else _local_exists(path)

def list_dataset_meta_paths() -> List[str]:
    return _blob_list_dataset_meta_paths() if settings.USE_AZURE_BLOB else _local_list_dataset_meta_paths()
