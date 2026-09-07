from __future__ import annotations

import argparse
import sys
import time
import traceback

from . import db
from .bank import load_catalog, public_view
from .catalog_types import normalize_our_types
from .config import IMPORT_DELAY_SEC
from .importers import fetch_boj, fetch_codeforces, fetch_leetcode
from .importers.htmlparse import statement_incomplete


def import_one(entry: dict) -> dict:
    src = entry["source"]
    if src == "boj":
        data = fetch_boj(int(entry["source_id"]))
    elif src == "leetcode":
        data = fetch_leetcode(str(entry["source_id"]))
    elif src == "codeforces":
        cid, idx = str(entry["source_id"]).split("-", 1)
        data = fetch_codeforces(int(cid), idx)
    else:
        raise ValueError(f"unknown source {src}")
    data["tier"] = entry.get("tier", 1)
    data["sort_order"] = entry.get("order", 100)
    data["our_types"] = normalize_our_types(entry.get("our_types") or entry.get("tags") or [])
    return data


def catalog_pid(entry: dict) -> str:
    return entry.get("id") or f"{entry['source']}-{entry['source_id']}"


def refetch_problem(conn, problem_id: str) -> dict:
    raw = db.get_db_problem(conn, problem_id)
    if not raw:
        raise ValueError("문제를 찾을 수 없습니다")
    entry = None
    for e in load_catalog():
        if catalog_pid(e) == problem_id:
            entry = dict(e)
            break
    if not entry:
        entry = {
            "id": raw["id"],
            "source": raw["source"],
            "source_id": raw["source_id"],
            "our_types": raw.get("our_types") or [],
            "tier": raw.get("tier", 1),
            "order": raw.get("order", 100),
        }
    data = import_one(entry)
    data["id"] = problem_id
    db.upsert_problem(conn, data)
    updated = db.get_db_problem(conn, problem_id)
    if not updated:
        raise ValueError("저장에 실패했습니다")
    return public_view(updated)


def run(
    only: str | None = None,
    limit: int | None = None,
    skip_existing: bool = False,
    refetch_missing: bool = False,
    refetch_unofficial: bool = False,
    supabase: bool = False,
) -> int:
    conn = db.get_conn()
    db.init_db(conn)
    if supabase:
        from .supabase_push import require_supabase

        require_supabase()
    catalog = load_catalog()
    if only:
        catalog = [e for e in catalog if e["id"] == only or e.get("source_id") == only]
    existing: set[str] = set()
    if skip_existing:
        existing = {p["id"] for p in db.list_db_problems(conn)}
        catalog = [
            e
            for e in catalog
            if catalog_pid(e) not in existing
        ]
    if refetch_missing:
        missing = {
            p["id"]
            for p in db.list_db_problems(conn)
            if statement_incomplete(p.get("statement_html") or "")
        }
        catalog = [e for e in catalog if catalog_pid(e) in missing]
        print(f"missing statement={len(catalog)}", flush=True)
    if refetch_unofficial:
        unofficial = {
            p["id"]
            for p in db.list_db_problems(conn)
            if p.get("source") == "boj" and "<h3>문제</h3>" not in (p.get("statement_html") or "")
        }
        catalog = [e for e in catalog if catalog_pid(e) in unofficial]
        print(f"unofficial statement={len(catalog)}", flush=True)
    if limit:
        catalog = catalog[:limit]
    ok = fail = skipped = 0
    if skip_existing:
        skipped = len(existing)
        print(f"already in db={skipped}, to import={len(catalog)}", flush=True)
    for i, entry in enumerate(catalog, start=1):
        pid = catalog_pid(entry)
        print(f"[{i}/{len(catalog)}] {pid} ...", flush=True)
        try:
            data = import_one(entry)
            data["id"] = pid
            db.upsert_problem(conn, data)
            if supabase:
                from .supabase_push import upsert_one

                stored = db.get_db_problem(conn, pid)
                if stored:
                    upsert_one(stored)
            n = len(data.get("tests") or [])
            print(f"  ok  {data['title']}  samples={n}")
            ok += 1
        except Exception as e:
            fail += 1
            print(f"  FAIL {e}")
            traceback.print_exc()
        if i < len(catalog):
            time.sleep(IMPORT_DELAY_SEC)
    print(f"done ok={ok} fail={fail}")
    return 0 if fail == 0 else 1


def main():
    parser = argparse.ArgumentParser(description="백준/리트코드/코드포스 문제를 가져와 DB에 저장합니다.")
    parser.add_argument("--only", help="하나의 문제 id만")
    parser.add_argument("--limit", type=int, help="앞에서 N개만")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="DB에 이미 있는 id는 다시 받지 않음",
    )
    parser.add_argument(
        "--refetch-missing",
        action="store_true",
        help="지문이 비었거나 가져오기 실패 안내만 있는 문제를 다시 받음",
    )
    parser.add_argument(
        "--refetch-unofficial",
        action="store_true",
        help="백준 공식 지문 형식이 아닌 문제를 다시 받음",
    )
    parser.add_argument(
        "--supabase",
        action="store_true",
        help="가져온 뒤 공개 예제만 Supabase problems 에 upsert",
    )
    args = parser.parse_args()
    sys.exit(
        run(
            only=args.only,
            limit=args.limit,
            skip_existing=args.skip_existing,
            refetch_missing=args.refetch_missing,
            refetch_unofficial=args.refetch_unofficial,
            supabase=args.supabase,
        )
    )


if __name__ == "__main__":
    main()
