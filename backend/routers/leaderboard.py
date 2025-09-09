from fastapi import APIRouter, Query
from typing import List, Dict, Any, Optional
from pathlib import Path
import json

router = APIRouter()

# project_root/.../backend/routers/leaderboard.py  -> parents[2] is project root
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BENCH_FILE = DATA_DIR / "benchmarks.json"
LB_FILE = DATA_DIR / "leaderboard.json"

def _read_json(path: Path):
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

@router.get("/api/benchmarks")
def list_benchmarks() -> List[Dict[str, Any]]:
    """List available benchmark datasets."""
    return _read_json(BENCH_FILE)

@router.get("/api/leaderboard")
def leaderboard(benchmark: Optional[str] = Query(None)) -> List[Dict[str, Any]]:
    """
    Global leaderboard (optionally filter by ?benchmark=<benchmark_id>).
    Each entry in leaderboard.json must have 'benchmark': <id>.
    """
    items = _read_json(LB_FILE)
    if benchmark:
        items = [x for x in items if x.get("benchmark") == benchmark]
    return items

@router.get("/api/benchmarks/{bid}/leaderboard")
def leaderboard_by_benchmark(bid: str) -> List[Dict[str, Any]]:
    """Per-benchmark leaderboard (same data, filtered on server)."""
    items = _read_json(LB_FILE)
    return [x for x in items if x.get("benchmark") == bid]
