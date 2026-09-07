from __future__ import annotations

import os
from pathlib import Path


def _path(name: str, default: Path) -> Path:
    raw = os.environ.get(name)
    return Path(raw).expanduser().resolve() if raw else default


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip().lstrip("\ufeff")
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in {"'", '"'}:
            val = val[1:-1]
        if key:
            os.environ.setdefault(key, val)


_ROOT_DEFAULT = Path(__file__).resolve().parents[2]
_load_env_file(_ROOT_DEFAULT / ".env")
ROOT = _path("CODINGTEST_ROOT", _path("COTEKING_ROOT", _ROOT_DEFAULT))
BACKEND_DIR = ROOT / "backend"
DATA_DIR = _path("DATA_DIR", ROOT / "data")
CATALOG_PATH = BACKEND_DIR / "catalog" / "seed.json"
_default_db = DATA_DIR / "codingtest.db"
_legacy_db = DATA_DIR / "coteking.db"
if os.environ.get("DB_PATH"):
    DB_PATH = _path("DB_PATH", _default_db)
elif _legacy_db.exists() and not _default_db.exists():
    DB_PATH = _legacy_db
else:
    DB_PATH = _default_db

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL", "").strip()
    or os.environ.get("VITE_SUPABASE_URL", "").strip()
).rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

IMPORT_DELAY_SEC = float(os.environ.get("IMPORT_DELAY_SEC", "0.7"))
HTTP_TIMEOUT_SEC = float(os.environ.get("HTTP_TIMEOUT_SEC", "25"))

STARTER = {
    "python": """\
import sys

def main():
    data = sys.stdin.read().split()
    # TODO: 문제를 푸세요
    print()

if __name__ == "__main__":
    main()
""",
}

SOURCE_LABEL = {
    "boj": "백준",
    "leetcode": "LeetCode",
    "codeforces": "Codeforces",
}
