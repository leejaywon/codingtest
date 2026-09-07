import json
import sqlite3
import time

from .config import DATA_DIR, DB_PATH


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _add_column_if_missing(conn: sqlite3.Connection, table: str, name: str, decl: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {r["name"] for r in rows}
    if name not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS problems (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_url TEXT NOT NULL,
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL DEFAULT '',
            tier INTEGER NOT NULL DEFAULT 1,
            tags_json TEXT NOT NULL DEFAULT '[]',
            time_limit_ms INTEGER NOT NULL DEFAULT 2000,
            memory_limit_mb INTEGER NOT NULL DEFAULT 256,
            statement_html TEXT NOT NULL DEFAULT '',
            input_spec TEXT NOT NULL DEFAULT '',
            output_spec TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            tests_json TEXT NOT NULL DEFAULT '[]',
            judge_mode TEXT NOT NULL DEFAULT 'stdin',
            sort_order INTEGER NOT NULL DEFAULT 100,
            imported_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_problems_source ON problems(source, sort_order);
        """
    )
    _add_column_if_missing(conn, "problems", "source_difficulty", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(conn, "problems", "source_tags_json", "TEXT NOT NULL DEFAULT '[]'")
    _add_column_if_missing(conn, "problems", "our_types_json", "TEXT NOT NULL DEFAULT '[]'")
    conn.commit()


def upsert_problem(conn: sqlite3.Connection, p: dict) -> None:
    source_tags = p.get("source_tags") if p.get("source_tags") is not None else p.get("tags", [])
    our_types = p.get("our_types") or []
    source_difficulty = p.get("source_difficulty") or p.get("difficulty") or ""
    conn.execute(
        """
        INSERT INTO problems (
            id, source, source_id, source_url, title, difficulty, tier, tags_json,
            time_limit_ms, memory_limit_mb, statement_html, input_spec, output_spec,
            notes, tests_json, judge_mode, sort_order, imported_at,
            source_difficulty, source_tags_json, our_types_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            source=excluded.source,
            source_id=excluded.source_id,
            source_url=excluded.source_url,
            title=excluded.title,
            difficulty=excluded.difficulty,
            tier=excluded.tier,
            tags_json=excluded.tags_json,
            time_limit_ms=excluded.time_limit_ms,
            memory_limit_mb=excluded.memory_limit_mb,
            statement_html=excluded.statement_html,
            input_spec=excluded.input_spec,
            output_spec=excluded.output_spec,
            notes=excluded.notes,
            tests_json=excluded.tests_json,
            judge_mode=excluded.judge_mode,
            sort_order=excluded.sort_order,
            imported_at=excluded.imported_at,
            source_difficulty=excluded.source_difficulty,
            source_tags_json=excluded.source_tags_json,
            our_types_json=excluded.our_types_json
        """,
        (
            p["id"],
            p["source"],
            p["source_id"],
            p["source_url"],
            p["title"],
            source_difficulty,
            p.get("tier", 1),
            json.dumps(source_tags, ensure_ascii=False),
            p.get("time_limit_ms", 2000),
            p.get("memory_limit_mb", 256),
            p.get("statement_html", ""),
            p.get("input_spec", ""),
            p.get("output_spec", ""),
            p.get("notes", ""),
            json.dumps(p.get("tests", []), ensure_ascii=False),
            p.get("judge_mode", "stdin"),
            p.get("sort_order", 100),
            int(time.time()),
            source_difficulty,
            json.dumps(source_tags, ensure_ascii=False),
            json.dumps(our_types, ensure_ascii=False),
        ),
    )
    conn.commit()


def list_db_problems(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM problems ORDER BY sort_order, id").fetchall()
    return [_problem_row(r) for r in rows]


def get_db_problem(conn: sqlite3.Connection, problem_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM problems WHERE id = ?", (problem_id,)).fetchone()
    return _problem_row(row) if row else None


def _problem_row(row: sqlite3.Row) -> dict:
    from .catalog_types import normalize_our_types, split_legacy_tags

    keys = row.keys()
    legacy_tags = json.loads(row["tags_json"] or "[]")
    source_difficulty = ""
    if "source_difficulty" in keys:
        source_difficulty = row["source_difficulty"] or ""
    if not source_difficulty:
        source_difficulty = row["difficulty"] or ""

    source_tags: list[str] = []
    our_types: list[str] = []
    if "source_tags_json" in keys:
        source_tags = json.loads(row["source_tags_json"] or "[]")
    if "our_types_json" in keys:
        our_types = json.loads(row["our_types_json"] or "[]")
    our_types = normalize_our_types(our_types)
    if not our_types and not source_tags:
        our_types, source_tags = split_legacy_tags(legacy_tags)
    elif not our_types:
        our_types, leftover = split_legacy_tags(legacy_tags)
        if leftover and not source_tags:
            source_tags = leftover
    elif not source_tags:
        source_tags = legacy_tags

    return {
        "id": row["id"],
        "source": row["source"],
        "source_id": row["source_id"],
        "source_url": row["source_url"],
        "title": row["title"],
        "difficulty": source_difficulty,
        "source_difficulty": source_difficulty,
        "tier": row["tier"],
        "tags": source_tags,
        "source_tags": source_tags,
        "our_types": our_types,
        "time_limit_ms": row["time_limit_ms"],
        "memory_limit_mb": row["memory_limit_mb"],
        "statement_html": row["statement_html"],
        "statement": row["statement_html"],
        "input_spec": row["input_spec"],
        "output_spec": row["output_spec"],
        "notes": row["notes"],
        "tests": json.loads(row["tests_json"] or "[]"),
        "judge_mode": row["judge_mode"],
        "order": row["sort_order"],
    }
