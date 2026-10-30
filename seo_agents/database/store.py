"""SQLite persistence for runs. Swap for Postgres when you scale past one instance."""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Optional

from seo_agents.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    tier TEXT NOT NULL,
    keyword TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_owner_created ON runs(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS serp_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_settings().database_path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    path = get_settings().database_path
    folder = os.path.dirname(os.path.abspath(path))
    os.makedirs(folder, exist_ok=True)
    with _conn() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)


def _row(row: sqlite3.Row, include_data: bool = True) -> dict[str, Any]:
    record = {
        "run_id": row["run_id"],
        "status": row["status"],
        "keyword": row["keyword"],
        "tier": row["tier"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    if include_data:
        record["data"] = json.loads(row["state_json"]) if row["state_json"] else None
    return record


def _score(row: sqlite3.Row) -> Optional[int]:
    try:
        return int(json.loads(row["state_json"] or "null")["seo_report"]["score"])
    except (TypeError, KeyError, ValueError):
        return None


def create_run(run_id: str, owner: str, tier: str, keyword: str) -> dict[str, Any]:
    now = _now()
    with _conn() as conn:
        conn.execute(
            "INSERT INTO runs (run_id, owner, tier, keyword, status, state_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'queued', NULL, ?, ?)",
            (run_id, owner, tier, keyword, now, now),
        )
    return {"run_id": run_id, "status": "queued", "keyword": keyword, "tier": tier,
            "created_at": now, "updated_at": now, "data": None}


def update_run(run_id: str, status: str, state_json: Optional[str] = None) -> None:
    with _conn() as conn:
        if state_json is None:
            conn.execute("UPDATE runs SET status=?, updated_at=? WHERE run_id=?", (status, _now(), run_id))
        else:
            conn.execute(
                "UPDATE runs SET status=?, state_json=?, updated_at=? WHERE run_id=?",
                (status, state_json, _now(), run_id),
            )


def get_run(run_id: str, owner: str) -> Optional[dict[str, Any]]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM runs WHERE run_id=? AND owner=?", (run_id, owner)).fetchone()
    return _row(row) if row else None


def list_runs(owner: str, limit: int = 20) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM runs WHERE owner=? ORDER BY created_at DESC LIMIT ?", (owner, limit)
        ).fetchall()
    return [{**_row(r, include_data=False), "score": _score(r)} for r in rows]


def fail_interrupted_runs() -> int:
    """Runs left queued/running by a crash or restart can never finish; mark them failed."""
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE runs SET status='failed', updated_at=? WHERE status IN ('queued','running')", (_now(),)
        )
        return cur.rowcount


def count_runs_since(owner: str, since_iso: str) -> int:
    with _conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM runs WHERE owner=? AND created_at>=?", (owner, since_iso)
        ).fetchone()
    return int(row["n"])


def delete_run(run_id: str, owner: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM runs WHERE run_id=? AND owner=?", (run_id, owner))
        return cur.rowcount > 0


def get_serp_cache(cache_key: str, max_age_hours: int) -> Optional[str]:
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()
    with _conn() as conn:
        row = conn.execute(
            "SELECT payload FROM serp_cache WHERE cache_key=? AND created_at>=?", (cache_key, cutoff)
        ).fetchone()
    return row["payload"] if row else None


def set_serp_cache(cache_key: str, payload: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO serp_cache (cache_key, payload, created_at) VALUES (?, ?, ?)",
            (cache_key, payload, _now()),
        )


def get_setting(key: str) -> Optional[str]:
    with _conn() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", (key, value, _now())
        )
