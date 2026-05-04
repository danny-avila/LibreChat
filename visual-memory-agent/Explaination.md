# Visual Memory Agent Technical Explaination

## 1) System Architecture (What Runs and Why)
The visual-memory-agent is split into two runtimes:
- `mcp_server.py` (MCP layer): tool definitions exposed to LibreChat.
- `main.py` (API layer): real processing logic (analysis, storage, retrieval, versioning, deletion).

Why this split:
- MCP layer keeps tool contracts stable for LibreChat.
- API layer keeps business logic centralized and testable.

Call path:
1. User message reaches LibreChat.
2. LLM chooses an MCP tool (for example `analyze_image_url`).
3. MCP tool sends JSON request to FastAPI endpoint (`VISUAL_MEMORY_API_BASE_URL`, default `http://127.0.0.1:8090`).
4. FastAPI uses `storage.py` and `database.py`.
5. Response goes back to MCP.
6. MCP enriches output with image markdown (`image`) and returns result to LibreChat.

## 2) How Information Is Extracted from Image (Deep Technical)
Extraction happens in `/analyze-image` inside `main.py`:

### Step A: Input normalization
Function: `_resolve_image_input(req)`
- If `req.image_url` exists:
- If it is inline base64 (`data:image/...`), decode directly.
- If it is `http(s)`, download bytes using `_decode_image_to_bytes()` with browser-like headers to avoid blocked image hosts.
- Convert bytes to data URI via `_build_data_uri_from_bytes()`.
- If `req.image_base64` exists, parse and normalize with `_build_data_uri()`.
- Output of this step: one clean `data:image/<mime>;base64,...` string.

### Step B: Vision model call
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Payload includes:
- `model` (env default `qwen/qwen2.5-vl-72b-instruct` unless overridden)
- `temperature: 0`
- `max_tokens: 2200`
- `response_format: {"type":"json_object"}`
- Strict system prompt enforcing exact JSON schema.
- User content includes both text prompt and image object (`type: image_url`, URL is the data URI).

### Step C: Model response extraction
- `_extract_content(resp_json)` handles both:
- string message content
- list-of-parts content
- `_parse_json(content)` handles:
- plain JSON
- JSON wrapped in markdown fences
- parse failures

### Step D: Output normalization
Function: `_normalize_analysis(raw_analysis, fallback_name)`
- Coerces every required field:
- text fields cleaned (`_clean_text`)
- list fields normalized (`_coerce_string_list`)
- object details normalized (`_coerce_object_details`)
- derives fallback `name` if missing (`_derive_name`)
- builds fallback `summary_detailed` if missing (`_build_fallback_summary_detailed`)

### Step E: Rate-limit fallback
If OpenRouter returns HTTP 429:
- `_build_rate_limited_fallback_analysis()` returns full schema (not partial failure).
- This allows saving/searching even during temporary upstream limits.

## 3) What "URI" Means Here
There are three different image identifiers in this project:

1. `image_base64`
- Raw base64 or data URI sent by client.
- Input-only format.

2. `image_uri`
- Internal storage path in DB.
- Example: `image_storage/ref_001_v2.jpg`
- Used by API/storage functions to load/delete file bytes.
- Not meant to be directly shown to end users.

3. `image_url`
- Public URL for rendering in chat UI.
- Built by `_build_public_image_url(image_uri, image_hash)`.
- Example: `http://localhost:8090/image_storage/ref_001_v2.jpg?h=<sha256>`
- `?h=<hash>` is cache-busting so browser does not show stale image.

URI resolution behavior:
- `_resolve_image_uri_path()` turns relative `image_uri` into absolute disk path under `IMAGE_STORAGE_DIR`.
- If absolute path is provided, it is used as-is.

## 4) Tool-by-Tool Technical Explanation

## 4.1 `analyze_image`
Location: MCP tool in `mcp_server.py` -> API `/analyze-image`

Inputs:
- `image_base64 | image_url`
- `prompt` (optional)
- `model` (optional)
- `save_reference` (optional)
- `reference_name` (optional)
- `reference_id` (optional)
- `user_id` (optional)

Technical behavior:
1. MCP posts to `/analyze-image`.
2. API normalizes image + calls model + normalizes JSON.
3. MCP auto-save logic:
- if auto-save is enabled, then:
- no `reference_id` -> `/create-reference`
- with `reference_id` -> `/create-new-version`
4. MCP returns analysis + saved reference metadata.

Important detail:
- `should_save_reference = AUTO_SAVE_REFERENCE or save_reference`
- So env auto-save=true forces saving even if tool call passes false.

## 4.2 `analyze_image_url`
Same core as `analyze_image`, but URL-first wrapper.

Difference:
- Requires `image_url` argument directly.
- Intended for web links and uploaded-file URLs.

Internally still uses same `/analyze-image` endpoint and same optional auto-save routing.

## 4.3 `create_reference`
Location: MCP `create_reference` -> API `/create-reference`

Inputs:
- `reference_name` optional
- `image_base64 | image_url | image_uri`
- `analysis` JSON
- `user_id` optional

Technical behavior:
1. `_decode_image_to_bytes()` gets raw bytes from one source:
- `image_uri` (local file)
- base64
- remote URL
2. `compute_hash(bytes)` -> SHA-256.
3. `check_duplicate_hash(hash)` global duplicate check.
4. If duplicate exists: returns existing `reference_id` + `version` with `is_duplicate=true`.
5. If new:
- `reference_id = get_next_reference_id()` -> `ref_###`
- `version = v1`
- `save_image()` writes file as `{reference_id}_{version}{ext}`
- `insert_reference()` writes DB row.

Output:
- `reference_id`, `version`, `reference_key`, `image_uri`, `image_url`, duplicate status.

## 4.4 `create_new_version`
Location: MCP `create_new_version` -> API `/create-new-version`

Inputs:
- `reference_id` required
- `image_base64 | image_url | image_uri`
- `analysis`
- `move_if_duplicate` (default true)
- `user_id`

Technical behavior:
1. Load latest row for target reference.
2. Decode image bytes and hash.
3. Duplicate branch:
- duplicate in same reference -> return existing duplicate version.
- duplicate in different reference:
- if `move_if_duplicate=true`: move row to target reference using `move_duplicate_to_reference()` and possibly rewrite file path/URI if collision.
- else 409 conflict.
4. Non-duplicate branch:
- `next_version = get_next_version(reference_id)`
- save file and insert row with `previous_version_id`.

Why rewrite image URI on moved duplicates:
- Prevent one file path from ambiguously representing a moved reference/version.
- Keep filename aligned with logical key.

## 4.5 `get_reference`
Location: MCP `get_reference` -> API `/get-reference`

Inputs:
- `reference_id`
- `version` optional (latest if omitted)

Technical behavior:
1. Fetch DB row by exact key or latest by `id DESC`.
2. Normalize rich analysis fields.
3. Merge with stored `analysis_json` via `_build_reference_analysis()`.
4. Build `reference_key` and public `image_url`.

Output includes complete rich fields:
- summaries, OCR, layout, style, objects, topics, entities, key phrases.

## 4.6 `fuzzy_search_references`
Location: MCP `fuzzy_search_references` -> API `/fuzzy-search-references`

Inputs:
- `query` (optional)
- `limit`

Technical behavior:
1. Query tokenization: `_extract_search_terms()` removes stop words.
2. Pulls up to 500 recent rows as candidate set.
3. For each row, builds combined searchable text across all rich fields.
4. Weighted scoring:
- name match highest
- summaries/caption/object/topic/entity/key_phrase weighted
- full query substring bonus
5. Multi-term strict filter (if >=2 terms) favors records matching multiple terms.
6. Final ordering preserves reference grouping + version progression.

## 4.7 `compare_versions`
Location: MCP `compare_versions` -> API `/compare-versions`

Inputs:
- `reference_id`
- `from_version`
- `to_version`
- optional prompt/model

Technical behavior:
1. Fetch both version rows from DB.
2. Load both image files from disk (`load_image`).
3. Convert each to data URI.
4. Send single model request containing both images.
5. Parse strict JSON diff schema.

Output:
- `summary`, `added`, `removed`, `changed`, `unchanged`, `confidence`.

## 4.8 `delete_reference`
Location: MCP `delete_reference` -> API `/delete-references`

Inputs:
- `reference_ids` (delete whole references)
- `reference_keys` (delete specific versions like `ref_001_v2`)
- `delete_all`

Technical behavior:
1. Validation: either specific targets OR delete_all.
2. Resolve targets via `get_delete_targets()`.
3. Delete unique image files from disk.
4. Delete rows in DB (`delete_reference_rows()`).
5. Return deletion report with missing ids/keys and failed file deletions.

## 5) Wrong Returned Images: Root Causes and Fixes

## Problem 1: stale browser image due to URL caching
Cause:
- same image URL can be cached by browser/UI.

Fix:
- `_build_public_image_url()` appends `?h=<image_hash>`.
- New content -> new hash -> forced fresh fetch.

## Problem 2: duplicate-move path ambiguity
Cause:
- when moving duplicate record from one reference to another, old image URI could remain path-aligned to old identity.

Fix:
- in `create_new_version()`, if moved record kept same URI:
- load old bytes,
- re-save under target reference/version filename,
- update DB URI (`update_reference_image_uri`),
- delete old file if replaced.

## Problem 3: unsafe markdown rendering source
Cause:
- rendering layer could previously fabricate/keep stale markdown structure.

Fix:
- `mcp_server.py::_add_image_markdown()` now relies only on API-returned validated `image_url`.
- If no valid URL, image markdown is removed.

## Problem 4: naming mismatch risk
Cause:
- inconsistent filename patterns make tracking by `reference_key` error-prone.

Fix:
- `save_image()` standardized naming: `{reference_id}_{version}{ext}`.

## 6) End-to-End Example (User Sends URL)
1. User sends `https://.../image.png`.
2. MCP tool `analyze_image_url` is called.
3. API downloads bytes with browser-like headers.
4. API converts bytes to data URI and sends to vision model.
5. Model returns structured JSON.
6. JSON is normalized into stable schema.
7. MCP auto-saves (default):
- new reference -> `create_reference`, or
- existing ref update -> `create_new_version`.
8. File saved in `image_storage/` and row inserted/updated in SQLite.
9. API returns `reference_id`, `version`, `reference_key`, `image_url`.
10. MCP returns enriched payload with markdown image.
11. Later retrieval calls (`get_reference`, `fuzzy_search_references`) reuse stored analysis without re-analyzing unless asked.

## 7) Important Edge Cases
- OpenRouter 429: system returns fallback structured analysis instead of hard failure.
- Invalid base64/data URI: 400 errors with explicit reason.
- Missing stored file: `image_url` suppressed (returns `None`) to avoid broken/wrong rendering.
- Duplicate same-image update: returns existing version metadata instead of creating fake new version.
- Deleting all rows resets SQLite sequence to keep IDs clean for next inserts.