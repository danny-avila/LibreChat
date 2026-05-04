import json
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional

DB_PATH = os.getenv("AGENT_DB_PATH", "./visual_memory.db")
SEARCH_STOP_WORDS = {
    "a", "an", "and", "any", "are", "be", "between", "can", "do", "for", "from", "give",
    "has", "have", "i", "if", "in", "is", "it", "its", "list", "me", "of", "on", "or",
    "please", "related", "say", "that", "the", "them", "there", "this", "to", "what",
    "with", "you",
}


def _extract_search_terms(query: str) -> list[str]:
    terms: list[str] = []
    for token in re.findall(r"[a-zA-Z0-9_+-]+", query.lower()):
        if len(token) < 2 or token in SEARCH_STOP_WORDS:
            continue
        if token not in terms:
            terms.append(token)
    return terms


def _parse_reference_number(reference_id: str) -> int:
    match = re.match(r"^ref_(\d+)$", (reference_id or "").strip().lower())
    if not match:
        return 0
    return int(match.group(1))


def _create_references_table(conn: sqlite3.Connection, table_name: str = "references_store") -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference_id TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT 'v1',
            name TEXT,
            image_hash TEXT UNIQUE NOT NULL,
            image_uri TEXT NOT NULL,
            caption TEXT,
            summary_short TEXT,
            summary_detailed TEXT,
            ocr_text TEXT,
            layout TEXT,
            layout_regions TEXT,
            scene_type TEXT,
            style TEXT,
            objects TEXT,
            objects_detailed TEXT,
            topics TEXT,
            entities TEXT,
            key_phrases TEXT,
            analysis_json TEXT NOT NULL DEFAULT '{{}}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            previous_version_id TEXT,
            user_id TEXT,
            UNIQUE(reference_id, version)
        )
        """
    )


def _create_indexes(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE INDEX IF NOT EXISTS idx_hash ON references_store(image_hash)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ref_id ON references_store(reference_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_name ON references_store(name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scene_type ON references_store(scene_type)")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _should_migrate_schema(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'references_store'"
    ).fetchone()
    if not row:
        return False
    create_sql = (row["sql"] or "").lower()
    return "reference_id text unique" in create_sql


def _migrate_schema_for_versioning(conn: sqlite3.Connection) -> None:
    _create_references_table(conn, table_name="references_store_new")
    conn.execute(
        """
        INSERT OR IGNORE INTO references_store_new
        (id, reference_id, version, name, image_hash, image_uri, caption, created_at, previous_version_id, user_id)
        SELECT id, reference_id, version, name, image_hash, image_uri, caption, created_at, previous_version_id, user_id
        FROM references_store
        """
    )
    conn.execute("DROP TABLE references_store")
    conn.execute("ALTER TABLE references_store_new RENAME TO references_store")


def _column_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute("PRAGMA table_info(references_store)").fetchall()
    return {str(row["name"]) for row in rows}


def _ensure_schema_columns(conn: sqlite3.Connection) -> None:
    required_columns: dict[str, str] = {
        "summary_short": "TEXT",
        "summary_detailed": "TEXT",
        "layout_regions": "TEXT",
        "scene_type": "TEXT",
        "objects_detailed": "TEXT",
        "topics": "TEXT",
        "entities": "TEXT",
        "key_phrases": "TEXT",
        "analysis_json": "TEXT NOT NULL DEFAULT '{}'",
    }
    existing_columns = _column_names(conn)
    for column_name, column_type in required_columns.items():
        if column_name in existing_columns:
            continue
        conn.execute(f"ALTER TABLE references_store ADD COLUMN {column_name} {column_type}")


def _backfill_missing_name(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE references_store
        SET name = COALESCE(
            NULLIF(TRIM(name), ''),
            NULLIF(TRIM(summary_short), ''),
            NULLIF(TRIM(caption), ''),
            reference_id || ' ' || version
        )
        WHERE name IS NULL OR TRIM(name) = ''
        """
    )


def _backfill_missing_rich_fields(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE references_store
        SET summary_short = COALESCE(
            NULLIF(TRIM(summary_short), ''),
            NULLIF(TRIM(caption), ''),
            name
        )
        WHERE summary_short IS NULL OR TRIM(summary_short) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET summary_detailed = COALESCE(
            NULLIF(TRIM(summary_detailed), ''),
            NULLIF(TRIM(summary_short), ''),
            NULLIF(TRIM(caption), ''),
            name
        )
        WHERE summary_detailed IS NULL OR TRIM(summary_detailed) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET layout_regions = '[]'
        WHERE layout_regions IS NULL OR TRIM(layout_regions) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET objects_detailed = '[]'
        WHERE objects_detailed IS NULL OR TRIM(objects_detailed) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET topics = '[]'
        WHERE topics IS NULL OR TRIM(topics) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET entities = '[]'
        WHERE entities IS NULL OR TRIM(entities) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET key_phrases = '[]'
        WHERE key_phrases IS NULL OR TRIM(key_phrases) = ''
        """
    )
    conn.execute(
        """
        UPDATE references_store
        SET analysis_json = '{}'
        WHERE analysis_json IS NULL OR TRIM(analysis_json) = ''
        """
    )


def init_db() -> None:
    with get_connection() as conn:
        _create_references_table(conn)
        if _should_migrate_schema(conn):
            _migrate_schema_for_versioning(conn)
        _ensure_schema_columns(conn)
        _backfill_missing_name(conn)
        _backfill_missing_rich_fields(conn)
        _create_indexes(conn)
        conn.commit()


def _parse_json_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [str(item) for item in parsed if str(item).strip()]
    return []


def _parse_json_object_list(value: object) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    return []


def _parse_json_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    record["objects"] = _parse_json_list(record.get("objects"))
    record["layout_regions"] = _parse_json_list(record.get("layout_regions"))
    record["topics"] = _parse_json_list(record.get("topics"))
    record["entities"] = _parse_json_list(record.get("entities"))
    record["key_phrases"] = _parse_json_list(record.get("key_phrases"))
    record["objects_detailed"] = _parse_json_object_list(record.get("objects_detailed"))
    record["analysis_json"] = _parse_json_dict(record.get("analysis_json"))
    record["name"] = str(record.get("name") or "").strip()
    if not record["name"]:
        summary_short = str(record.get("summary_short") or "").strip()
        caption = str(record.get("caption") or "").strip()
        record["name"] = summary_short or caption or f"{record.get('reference_id', 'reference')} {record.get('version', 'v1')}"
    return record


def check_duplicate_hash(image_hash: str) -> Optional[Dict]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT reference_id, version, image_uri, image_hash, name
            FROM references_store
            WHERE image_hash = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (image_hash,),
        ).fetchone()
        return dict(row) if row else None


def get_next_reference_id() -> str:
    with get_connection() as conn:
        result = conn.execute(
            "SELECT MAX(CAST(SUBSTR(reference_id, 5) AS INTEGER)) as max_num FROM references_store"
        ).fetchone()
        next_num = (result["max_num"] or 0) + 1
        return f"ref_{next_num:03d}"


def _parse_version_number(version: str) -> int:
    match = re.match(r"^v(\d+)$", (version or "").strip().lower())
    if not match:
        return 0
    return int(match.group(1))


def get_latest_reference(reference_id: str) -> Optional[Dict]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM references_store
            WHERE reference_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (reference_id,),
        ).fetchone()
        if not row:
            return None
        return _normalize_record(dict(row))


def get_next_version(reference_id: str) -> str:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT version FROM references_store WHERE reference_id = ?",
            (reference_id,),
        ).fetchall()
        max_version = 0
        for row in rows:
            max_version = max(max_version, _parse_version_number(row["version"]))
        return f"v{max_version + 1}"


def insert_reference(
    reference_id: str,
    version: str,
    name: Optional[str],
    image_hash: str,
    image_uri: str,
    analysis: Dict,
    user_id: Optional[str] = None,
    previous_version_id: Optional[str] = None,
) -> Dict:
    explicit_name = str(name or "").strip()
    analysis_name = str(analysis.get("name") or "").strip()
    summary_short = str(analysis.get("summary_short") or "").strip()
    caption = str(analysis.get("caption") or "").strip()
    resolved_name = explicit_name or analysis_name or summary_short or caption or f"{reference_id} {version}"
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO references_store
            (reference_id, version, name, image_hash, image_uri,
             caption, summary_short, summary_detailed, ocr_text, layout, layout_regions, scene_type, style,
             objects, objects_detailed, topics, entities, key_phrases, analysis_json, user_id, previous_version_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference_id,
                version,
                resolved_name,
                image_hash,
                image_uri,
                caption,
                summary_short,
                str(analysis.get("summary_detailed") or "").strip(),
                str(analysis.get("ocr_text") or "").strip(),
                str(analysis.get("layout") or "").strip(),
                json.dumps(analysis.get("layout_regions", [])),
                str(analysis.get("scene_type") or "").strip(),
                str(analysis.get("style") or "").strip(),
                json.dumps(analysis.get("objects", [])),
                json.dumps(analysis.get("objects_detailed", [])),
                json.dumps(analysis.get("topics", [])),
                json.dumps(analysis.get("entities", [])),
                json.dumps(analysis.get("key_phrases", [])),
                json.dumps(analysis),
                user_id,
                previous_version_id,
            ),
        )
        conn.commit()
        return {
            "reference_id": reference_id,
            "version": version,
            "image_uri": image_uri,
            "name": resolved_name,
        }


def get_reference(reference_id: str, version: Optional[str] = None) -> Optional[Dict]:
    with get_connection() as conn:
        if version:
            row = conn.execute(
                "SELECT * FROM references_store WHERE reference_id = ? AND version = ?",
                (reference_id, version),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM references_store WHERE reference_id = ? ORDER BY id DESC LIMIT 1",
                (reference_id,),
            ).fetchone()
        if not row:
            return None
        return _normalize_record(dict(row))


def get_reference_versions(reference_id: str) -> List[Dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT reference_id, version, name, image_uri, image_hash, caption, summary_short, summary_detailed,
                   ocr_text, layout, layout_regions, scene_type, style, objects, objects_detailed, topics,
                   entities, key_phrases, analysis_json, created_at
            FROM references_store
            WHERE reference_id = ?
            ORDER BY id ASC
            """,
            (reference_id,),
        ).fetchall()
        results: List[Dict] = []
        for row in rows:
            results.append(_normalize_record(dict(row)))
        return results


def search_references(query: str = "", limit: int = 10) -> List[Dict]:
    cleaned_query = (query or "").strip()
    safe_limit = max(1, min(limit, 100))
    with get_connection() as conn:
        if not cleaned_query:
            rows = conn.execute(
                """
                SELECT reference_id, version, name, image_uri, caption, summary_short, summary_detailed, ocr_text,
                       layout, layout_regions, scene_type, style, objects, objects_detailed, topics, entities,
                       image_hash,
                       key_phrases, analysis_json, created_at
                FROM references_store
                ORDER BY id DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            results = []
            for row in rows:
                results.append(_normalize_record(dict(row)))
            results.sort(
                key=lambda record: (
                    _parse_reference_number(str(record.get("reference_id") or "")),
                    _parse_version_number(str(record.get("version") or "")),
                )
            )
            return results

        terms = _extract_search_terms(cleaned_query)
        if not terms:
            terms = [cleaned_query.lower()]

        rows = conn.execute(
            """
            SELECT reference_id, version, name, image_uri, caption, summary_short, summary_detailed, ocr_text,
                   layout, layout_regions, scene_type, style, objects, objects_detailed, topics, entities,
                   image_hash,
                   key_phrases, analysis_json, created_at
            FROM references_store
            ORDER BY id DESC
            LIMIT 500
            """
        ).fetchall()

        scored_results: list[dict[str, Any]] = []
        query_lc = cleaned_query.lower()
        for row in rows:
            record = _normalize_record(dict(row))

            name = record["name"].lower()
            caption = str(record.get("caption") or "").lower()
            summary_short = str(record.get("summary_short") or "").lower()
            summary_detailed = str(record.get("summary_detailed") or "").lower()
            ocr_text = str(record.get("ocr_text") or "").lower()
            layout = str(record.get("layout") or "").lower()
            style = str(record.get("style") or "").lower()
            scene_type = str(record.get("scene_type") or "").lower()
            objects_text = " ".join(record.get("objects", [])).lower()
            objects_detailed_text = " ".join(
                str(obj.get("label", "")).strip() for obj in record.get("objects_detailed", [])
            ).lower()
            topics_text = " ".join(record.get("topics", [])).lower()
            entities_text = " ".join(record.get("entities", [])).lower()
            key_phrases_text = " ".join(record.get("key_phrases", [])).lower()
            combined_text = (
                f"{name} {caption} {summary_short} {summary_detailed} {ocr_text} {layout} {style} {scene_type} "
                f"{objects_text} {objects_detailed_text} {topics_text} {entities_text} {key_phrases_text}"
            ).strip()

            score = 0
            matched_terms: set[str] = set()
            full_query_match = bool(query_lc and query_lc in combined_text)
            if query_lc and query_lc in combined_text:
                score += 6
            for term in terms:
                term_matched = False
                if term in name:
                    score += 5
                    term_matched = True
                if term in summary_short or term in summary_detailed:
                    score += 4
                    term_matched = True
                if term in caption:
                    score += 3
                    term_matched = True
                if term in ocr_text:
                    score += 3
                    term_matched = True
                if term in layout or term in style or term in scene_type:
                    score += 2
                    term_matched = True
                if term in objects_text or term in objects_detailed_text:
                    score += 3
                    term_matched = True
                if term in topics_text or term in entities_text or term in key_phrases_text:
                    score += 3
                    term_matched = True
                if term_matched:
                    matched_terms.add(term)
            if score > 0:
                scored_results.append(
                    {
                        "score": score,
                        "record": record,
                        "matched_term_count": len(matched_terms),
                        "full_query_match": full_query_match,
                    }
                )

        scored_results.sort(
            key=lambda item: (
                item["score"],
                item["matched_term_count"],
                item["record"].get("created_at") or "",
            ),
            reverse=True,
        )

        filtered_results = scored_results
        if len(terms) >= 2:
            stricter_results = [
                item
                for item in scored_results
                if item["full_query_match"] or item["matched_term_count"] >= 2
            ]
            if stricter_results:
                filtered_results = stricter_results

        top_results = filtered_results[:safe_limit]
        reference_rank: dict[str, int] = {}
        for index, item in enumerate(top_results):
            reference_id = str(item["record"].get("reference_id") or "")
            if reference_id not in reference_rank:
                reference_rank[reference_id] = index
        top_results.sort(
            key=lambda item: (
                reference_rank.get(str(item["record"].get("reference_id") or ""), 0),
                _parse_version_number(str(item["record"].get("version") or "")),
            )
        )
        ranked_results = [item["record"] for item in top_results]
        return ranked_results


def _normalize_reference_ids(reference_ids: Optional[List[str]]) -> List[str]:
    if not reference_ids:
        return []
    normalized_ids: list[str] = []
    seen_ids: set[str] = set()
    for reference_id in reference_ids:
        cleaned_id = (reference_id or "").strip()
        if not cleaned_id or cleaned_id in seen_ids:
            continue
        seen_ids.add(cleaned_id)
        normalized_ids.append(cleaned_id)
    return normalized_ids


def _normalize_reference_keys(reference_keys: Optional[List[str]]) -> List[str]:
    if not reference_keys:
        return []
    normalized_keys: list[str] = []
    seen_keys: set[str] = set()
    for reference_key in reference_keys:
        cleaned_key = (reference_key or "").strip()
        if not cleaned_key or cleaned_key in seen_keys:
            continue
        seen_keys.add(cleaned_key)
        normalized_keys.append(cleaned_key)
    return normalized_keys


def _parse_reference_key(reference_key: str) -> tuple[str, str] | None:
    match = re.match(r"^(ref_\d+)_(v\d+)$", reference_key.strip().lower())
    if not match:
        return None
    return match.group(1), match.group(2)


def get_delete_targets(
    reference_ids: Optional[List[str]] = None,
    reference_keys: Optional[List[str]] = None,
    delete_all: bool = False,
) -> Dict:
    normalized_ids = _normalize_reference_ids(reference_ids)
    normalized_keys = _normalize_reference_keys(reference_keys)
    key_pairs = [pair for pair in (_parse_reference_key(key) for key in normalized_keys) if pair]
    with get_connection() as conn:
        if delete_all:
            rows = conn.execute(
                """
                SELECT reference_id, image_uri
                FROM references_store
                """
            ).fetchall()
            deleted_rows = [dict(row) for row in rows]
            unique_reference_ids = sorted({row["reference_id"] for row in deleted_rows})
            return {
                "rows": deleted_rows,
                "reference_ids": unique_reference_ids,
                "missing_reference_ids": [],
            }
        if not normalized_ids and not key_pairs:
            return {
                "rows": [],
                "reference_ids": [],
                "reference_keys": [],
                "missing_reference_ids": [],
                "missing_reference_keys": normalized_keys,
            }
        rows = []
        if normalized_ids:
            placeholders = ",".join("?" for _ in normalized_ids)
            rows.extend(
                conn.execute(
                    f"""
                    SELECT reference_id, version, image_uri
                    FROM references_store
                    WHERE reference_id IN ({placeholders})
                    """,
                    tuple(normalized_ids),
                ).fetchall()
            )
        if key_pairs:
            key_conditions = " OR ".join("(reference_id = ? AND version = ?)" for _ in key_pairs)
            key_params: list[str] = []
            for ref_id, version in key_pairs:
                key_params.extend([ref_id, version])
            rows.extend(
                conn.execute(
                    f"""
                    SELECT reference_id, version, image_uri
                    FROM references_store
                    WHERE {key_conditions}
                    """,
                    tuple(key_params),
                ).fetchall()
            )
        deleted_rows = [dict(row) for row in rows]
        found_ids = {row["reference_id"] for row in deleted_rows}
        found_keys = {f"{row['reference_id']}_{row['version']}" for row in deleted_rows if row.get("version")}
        missing_ids = [reference_id for reference_id in normalized_ids if reference_id not in found_ids]
        missing_keys = [reference_key for reference_key in normalized_keys if reference_key.lower() not in found_keys]
        return {
            "rows": deleted_rows,
            "reference_ids": sorted(found_ids),
            "reference_keys": sorted(found_keys),
            "missing_reference_ids": missing_ids,
            "missing_reference_keys": missing_keys,
        }


def delete_reference_rows(
    reference_ids: Optional[List[str]] = None,
    reference_keys: Optional[List[str]] = None,
    delete_all: bool = False,
) -> int:
    normalized_ids = _normalize_reference_ids(reference_ids)
    normalized_keys = _normalize_reference_keys(reference_keys)
    key_pairs = [pair for pair in (_parse_reference_key(key) for key in normalized_keys) if pair]
    with get_connection() as conn:
        if delete_all:
            result = conn.execute("DELETE FROM references_store")
            remaining = conn.execute("SELECT COUNT(*) AS count FROM references_store").fetchone()
            if int(remaining["count"]) == 0:
                conn.execute("DELETE FROM sqlite_sequence WHERE name = 'references_store'")
            conn.commit()
            return result.rowcount or 0
        if not normalized_ids and not key_pairs:
            return 0
        deleted_total = 0
        if normalized_ids:
            placeholders = ",".join("?" for _ in normalized_ids)
            result = conn.execute(
                f"DELETE FROM references_store WHERE reference_id IN ({placeholders})",
                tuple(normalized_ids),
            )
            deleted_total += result.rowcount or 0
        if key_pairs:
            key_conditions = " OR ".join("(reference_id = ? AND version = ?)" for _ in key_pairs)
            key_params: list[str] = []
            for ref_id, version in key_pairs:
                key_params.extend([ref_id, version])
            result = conn.execute(
                f"DELETE FROM references_store WHERE {key_conditions}",
                tuple(key_params),
            )
            deleted_total += result.rowcount or 0
        remaining = conn.execute("SELECT COUNT(*) AS count FROM references_store").fetchone()
        if int(remaining["count"]) == 0:
            conn.execute("DELETE FROM sqlite_sequence WHERE name = 'references_store'")
        conn.commit()
        return deleted_total


def move_duplicate_to_reference(
    source_reference_id: str,
    source_version: str,
    target_reference_id: str,
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        source_row = conn.execute(
            """
            SELECT *
            FROM references_store
            WHERE reference_id = ? AND version = ?
            LIMIT 1
            """,
            (source_reference_id, source_version),
        ).fetchone()
        if not source_row:
            return None
        max_version_row = conn.execute(
            "SELECT version FROM references_store WHERE reference_id = ?",
            (target_reference_id,),
        ).fetchall()
        max_version = 0
        for row in max_version_row:
            max_version = max(max_version, _parse_version_number(row["version"]))
        next_version = f"v{max_version + 1}"
        previous_version = f"v{max_version}" if max_version > 0 else None
        effective_user_id = user_id if user_id is not None else source_row["user_id"]
        conn.execute(
            """
            UPDATE references_store
            SET reference_id = ?, version = ?, previous_version_id = ?, user_id = ?
            WHERE reference_id = ? AND version = ?
            """,
            (
                target_reference_id,
                next_version,
                previous_version,
                effective_user_id,
                source_reference_id,
                source_version,
            ),
        )
        conn.commit()
    return get_reference(target_reference_id, next_version)


def update_reference_image_uri(reference_id: str, version: str, image_uri: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE references_store
            SET image_uri = ?
            WHERE reference_id = ? AND version = ?
            """,
            (image_uri, reference_id, version),
        )
        conn.commit()
