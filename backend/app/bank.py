from __future__ import annotations

import json

from . import db
from .catalog_types import normalize_our_types
from .config import CATALOG_PATH, SOURCE_LABEL, STARTER
from .importers.htmlparse import normalize_statement_html, statement_incomplete


def all_problems(conn) -> list[dict]:
    return sorted(db.list_db_problems(conn), key=lambda x: (x.get("order", 100), x["id"]))


def get_raw(conn, problem_id: str) -> dict | None:
    return db.get_db_problem(conn, problem_id)


def _fields(raw: dict) -> dict:
    source = raw.get("source") or ""
    source_tags = raw.get("source_tags")
    if source_tags is None:
        source_tags = raw.get("tags") or []
    our_types = normalize_our_types(raw.get("our_types") or [])
    source_difficulty = raw.get("source_difficulty") or raw.get("difficulty") or ""
    return {
        "source": source,
        "source_id": raw.get("source_id", raw["id"]),
        "source_url": raw.get("source_url", ""),
        "source_label": SOURCE_LABEL.get(source, source),
        "source_difficulty": source_difficulty,
        "source_tags": source_tags,
        "our_types": our_types,
        "difficulty": source_difficulty,
        "tags": source_tags,
    }


def public_view(raw: dict) -> dict:
    tests = raw.get("tests") or []
    samples = [t for t in tests if not t.get("hidden")]
    extra = _fields(raw)
    html = raw.get("statement_html") or f"<p>{raw.get('statement', '')}</p>"
    html = normalize_statement_html(html, drop_samples=bool(samples))
    return {
        "id": raw["id"],
        "title": raw["title"],
        "tier": raw.get("tier", 1),
        "time_limit_ms": raw.get("time_limit_ms", 2000),
        "memory_limit_mb": raw.get("memory_limit_mb", 256),
        "statement_html": html,
        "input_spec": raw.get("input_spec", ""),
        "output_spec": raw.get("output_spec", ""),
        "notes": raw.get("notes", ""),
        "samples": samples,
        "starter": {lang: STARTER[lang] for lang in STARTER},
        "judge_mode": raw.get("judge_mode", "stdin"),
        "statement_incomplete": statement_incomplete(
            raw.get("statement_html") or raw.get("statement") or ""
        ),
        **extra,
    }


def list_public(conn) -> list[dict]:
    out = []
    for p in all_problems(conn):
        extra = _fields(p)
        out.append(
            {
                "id": p["id"],
                "title": p["title"],
                "tier": p.get("tier", 1),
                "time_limit_ms": p.get("time_limit_ms", 2000),
                "memory_limit_mb": p.get("memory_limit_mb", 256),
                "judge_mode": p.get("judge_mode", "stdin"),
                **extra,
            }
        )
    return out


def load_catalog() -> list[dict]:
    if not CATALOG_PATH.exists():
        return []
    with CATALOG_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("problems", data if isinstance(data, list) else [])
    for entry in entries:
        entry["our_types"] = normalize_our_types(
            entry.get("our_types") or entry.get("tags") or []
        )
    return entries
