from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

import httpx

from . import db
from .bank import public_view
from .config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

BATCH = 40


def public_problem_row(raw: dict) -> dict:
    pub = public_view(raw)
    samples = [
        {"input": t.get("input", ""), "output": t.get("output", "")}
        for t in pub.get("samples") or []
        if not t.get("hidden")
    ]
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": pub["id"],
        "source": pub.get("source") or "",
        "source_id": str(pub.get("source_id") or pub["id"]),
        "source_url": pub.get("source_url") or "",
        "title": pub["title"],
        "difficulty": pub.get("source_difficulty") or pub.get("difficulty") or "",
        "source_difficulty": pub.get("source_difficulty") or pub.get("difficulty") or "",
        "tier": int(pub.get("tier") or 1),
        "tags": pub.get("source_tags") or [],
        "source_tags": pub.get("source_tags") or [],
        "our_types": pub.get("our_types") or [],
        "time_limit_ms": int(pub.get("time_limit_ms") or 2000),
        "memory_limit_mb": int(pub.get("memory_limit_mb") or 256),
        "statement_html": pub.get("statement_html") or "",
        "input_spec": pub.get("input_spec") or "",
        "output_spec": pub.get("output_spec") or "",
        "notes": pub.get("notes") or "",
        "samples_json": samples,
        "judge_mode": pub.get("judge_mode") or "stdin",
        "sort_order": int(raw.get("order") or 100),
        "imported_at": now,
    }


def require_supabase() -> tuple[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise SystemExit(
            "SUPABASE_URL(또는 VITE_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY 를 .env에 넣으세요."
        )
    return SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


def _headers(key: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    out = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        out.update(extra)
    return out


def count_rows(client: httpx.Client, url: str, key: str, table: str) -> int:
    r = client.get(
        f"{url}/rest/v1/{table}",
        headers=_headers(key, {"Prefer": "count=exact"}),
        params={"select": "id", "limit": "0"},
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase count {table} failed {r.status_code}: {r.text}")
    cr = r.headers.get("content-range") or "*/0"
    return int(cr.rsplit("/", 1)[-1])


def existing_problem_ids(client: httpx.Client, url: str, key: str) -> set[str]:
    ids: set[str] = set()
    start = 0
    page = 1000
    while True:
        end = start + page - 1
        r = client.get(
            f"{url}/rest/v1/problems",
            headers=_headers(key, {"Range": f"{start}-{end}", "Prefer": "count=exact"}),
            params={"select": "id"},
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase list problems failed {r.status_code}: {r.text}")
        rows = r.json()
        ids.update(str(row["id"]) for row in rows)
        cr = r.headers.get("content-range") or ""
        total = int(cr.rsplit("/", 1)[-1]) if "/" in cr else start + len(rows)
        start += len(rows)
        if not rows or start >= total:
            break
    return ids


def upsert_problem_rows(rows: list[dict]) -> None:
    if not rows:
        return
    url, key = require_supabase()
    headers = _headers(key, {"Prefer": "resolution=merge-duplicates,return=minimal"})
    endpoint = f"{url}/rest/v1/problems?on_conflict=id"
    with httpx.Client(timeout=60.0) as client:
        before_submissions = count_rows(client, url, key, "submissions")
        remote_ids = existing_problem_ids(client, url, key)
        incoming = {str(row["id"]) for row in rows}
        kept = remote_ids - incoming
        inserting = incoming - remote_ids
        updating = incoming & remote_ids
        print(
            f"problems insert={len(inserting)} update={len(updating)} keep_unlisted={len(kept)}",
            flush=True,
        )
        if kept:
            print(
                "leaving existing problems (and their solve history) that are not in this batch",
                flush=True,
            )
        for i in range(0, len(rows), BATCH):
            chunk = rows[i : i + BATCH]
            r = client.post(endpoint, headers=headers, json=chunk)
            if r.status_code >= 400:
                raise RuntimeError(f"Supabase upsert failed {r.status_code}: {r.text}")
        after_submissions = count_rows(client, url, key, "submissions")
        if after_submissions < before_submissions:
            raise RuntimeError(
                f"Aborted: submission count dropped {before_submissions} -> {after_submissions}"
            )


def upsert_one(raw: dict) -> None:
    upsert_problem_rows([public_problem_row(raw)])


def push_sqlite() -> int:
    require_supabase()
    conn = db.get_conn()
    db.init_db(conn)
    problems = db.list_db_problems(conn)
    if not problems:
        print("SQLite에 문제가 없습니다. 먼저 python -m app.import_catalog 를 실행하세요.")
        return 1
    rows = [public_problem_row(p) for p in problems]
    print(f"pushing {len(rows)} problems (samples only, no hidden tests, no deletes)", flush=True)
    upsert_problem_rows(rows)
    print("done")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="로컬 SQLite 문제(공개 예제만)를 Supabase problems 에 추가/갱신합니다. 기존 문제와 제출 기록은 지우지 않습니다."
    )
    parser.parse_args()
    sys.exit(push_sqlite())


if __name__ == "__main__":
    main()
