import os
import json
import base64
import binascii
import re
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Any, Optional, Dict
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError
from io import BytesIO

from database import (
    init_db,
    check_duplicate_hash,
    insert_reference,
    get_next_reference_id,
    get_reference as fetch_reference,
    get_latest_reference,
    get_next_version,
    search_references as fetch_references,
    get_delete_targets,
    delete_reference_rows,
    move_duplicate_to_reference,
    update_reference_image_uri,
)
from storage import _decode_image_to_bytes, compute_hash, save_image, delete_image, load_image, image_exists

load_dotenv()
app = FastAPI(title="Visual Memory Agent")
IMAGE_STORAGE_DIR = os.getenv("IMAGE_STORAGE_DIR", "./image_storage")
os.makedirs(IMAGE_STORAGE_DIR, exist_ok=True)
app.mount("/image_storage", StaticFiles(directory=IMAGE_STORAGE_DIR), name="image_storage")

@app.on_event("startup")
async def startup_event():
    init_db()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "qwen/qwen2.5-vl-72b-instruct")
TIMEOUT = int(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "60"))
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
PUBLIC_BASE_URL = os.getenv("VISUAL_MEMORY_PUBLIC_BASE_URL", "http://localhost:8090").rstrip("/")

class AnalyzeRequest(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    prompt: Optional[str] = (
        "Analyze this image with high detail and return rich structured JSON with summaries, "
        "text, objects, topics, entities, layout regions, and style."
    )
    model: Optional[str] = None


class ObjectDetail(BaseModel):
    label: str
    count: int = 1
    importance: str = "medium"
    attributes: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    name: str
    caption: str
    summary_short: str
    summary_detailed: str
    ocr_text: str
    layout: str
    layout_regions: list[str]
    scene_type: str
    style: str
    objects: list[str]
    objects_detailed: list[ObjectDetail]
    topics: list[str]
    entities: list[str]
    key_phrases: list[str]

class CreateReferenceRequest(BaseModel):
    reference_name: Optional[str] = None
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    image_uri: Optional[str] = None
    analysis: Dict
    user_id: Optional[str] = None

class CreateReferenceResponse(BaseModel):
    reference_id: str
    version: str
    reference_key: str
    is_duplicate: bool
    message: str
    image_uri: Optional[str] = None
    image_url: Optional[str] = None

class CreateNewVersionRequest(BaseModel):
    reference_id: str
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    image_uri: Optional[str] = None
    analysis: Dict
    move_if_duplicate: bool = True
    user_id: Optional[str] = None

class CreateNewVersionResponse(BaseModel):
    reference_id: str
    version: str
    reference_key: str
    is_duplicate: bool
    message: str
    image_uri: Optional[str] = None
    image_url: Optional[str] = None
    previous_version: Optional[str] = None
    duplicate_reference_id: Optional[str] = None
    duplicate_version: Optional[str] = None

class GetReferenceRequest(BaseModel):
    reference_id: str
    version: Optional[str] = None

class GetReferenceResponse(BaseModel):
    id: int
    reference_id: str
    version: str
    reference_key: str
    name: Optional[str] = None
    image_hash: str
    image_uri: str
    image_url: Optional[str] = None
    caption: Optional[str] = None
    summary_short: Optional[str] = None
    summary_detailed: Optional[str] = None
    ocr_text: Optional[str] = None
    layout: Optional[str] = None
    layout_regions: list[str]
    scene_type: Optional[str] = None
    style: Optional[str] = None
    objects: list[str]
    objects_detailed: list[ObjectDetail]
    topics: list[str]
    entities: list[str]
    key_phrases: list[str]
    analysis_json: Dict[str, Any]
    created_at: Optional[str] = None
    previous_version_id: Optional[str] = None
    user_id: Optional[str] = None

class FuzzySearchReferencesRequest(BaseModel):
    query: Optional[str] = ""
    limit: int = 10

class FuzzySearchReferenceItem(BaseModel):
    reference_id: str
    version: str
    reference_key: str
    name: Optional[str] = None
    image_uri: str
    image_url: Optional[str] = None
    caption: Optional[str] = None
    summary_short: Optional[str] = None
    summary_detailed: Optional[str] = None
    ocr_text: Optional[str] = None
    layout: Optional[str] = None
    layout_regions: list[str]
    scene_type: Optional[str] = None
    style: Optional[str] = None
    objects: list[str]
    objects_detailed: list[ObjectDetail]
    topics: list[str]
    entities: list[str]
    key_phrases: list[str]
    analysis_json: Dict[str, Any]
    created_at: Optional[str] = None

class DeleteReferencesRequest(BaseModel):
    delete_all: bool = False
    reference_ids: Optional[list[str]] = None
    reference_keys: Optional[list[str]] = None

class DeleteReferencesResponse(BaseModel):
    delete_all: bool
    deleted_rows: int
    deleted_reference_ids: list[str]
    deleted_reference_keys: list[str]
    missing_reference_ids: list[str]
    missing_reference_keys: list[str]
    deleted_files: int
    failed_file_deletions: list[str]
    message: str

class CompareVersionsRequest(BaseModel):
    reference_id: str
    from_version: str
    to_version: str
    prompt: Optional[str] = "Compare these two versions and return structured differences."
    model: Optional[str] = None

class CompareVersionsResponse(BaseModel):
    reference_id: str
    from_version: str
    to_version: str
    comparison: Dict

def _detect_mime(image_bytes: bytes) -> str:
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if image_bytes.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"): return "image/gif"
    return "image/jpeg"

def _build_public_image_url(image_uri: Optional[str], image_hash: Optional[str] = None) -> Optional[str]:
    if not image_uri:
        return None
    if not image_exists(image_uri):
        return None
    if image_uri.startswith("http://") or image_uri.startswith("https://"):
        return image_uri
    normalized = image_uri.replace("\\", "/").lstrip("/")
    url = f"{PUBLIC_BASE_URL}/{normalized}"
    if image_hash:
        return f"{url}?h={image_hash}"
    return url

def _build_data_uri_from_bytes(image_bytes: bytes) -> str:
    mime_type = _detect_mime(image_bytes)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _build_reference_key(reference_id: str, version: str) -> str:
    return f"{reference_id}_{version}"


def _try_local_image_uri_from_url(image_url: Optional[str]) -> Optional[str]:
    if not image_url:
        return None
    cleaned_url = image_url.strip()
    if not cleaned_url:
        return None
    parsed = urlparse(cleaned_url)
    if not parsed.path:
        return None
    normalized_path = parsed.path.replace("\\", "/")
    marker = "/image_storage/"
    marker_index = normalized_path.find(marker)
    if marker_index == -1:
        return None
    relative_path = normalized_path[marker_index + 1 :]
    if not relative_path:
        return None
    return relative_path

def _build_data_uri(image_input: str) -> str:
    image_data = image_input.strip()
    data_uri_match = re.match(
        r"^(?:data:)?(image/[\w.+-]+);base64,(.+)$",
        image_data,
        re.IGNORECASE | re.DOTALL,
    )
    if data_uri_match:
        mime_type = data_uri_match.group(1).lower()
        raw_b64 = data_uri_match.group(2)
    else:
        mime_type = None
        raw_b64 = image_data
    normalized_b64 = " ".join(raw_b64.split())
    try:
        image_bytes = base64.b64decode(normalized_b64, validate=True)
    except binascii.Error:
        try:
            image_bytes = base64.urlsafe_b64decode(normalized_b64 + "=" * (-len(normalized_b64) % 4))
        except binascii.Error:
            raise HTTPException(status_code=400, detail="Invalid image_base64 payload")
    try:
        image = Image.open(BytesIO(image_bytes))
        image.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid image bytes.")
    detected_mime = _detect_mime(image_bytes)
    clean_b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{detected_mime};base64,{clean_b64}"

def _resolve_image_input(req: AnalyzeRequest) -> str:
    if req.image_url:
        url = req.image_url.strip()
        if url.startswith("image/") or url.startswith("data:image/"):
            return _build_data_uri(url)
        if url.startswith("http://") or url.startswith("https://"):
            image_bytes = _decode_image_to_bytes(None, url)
            return _build_data_uri_from_bytes(image_bytes)
        raise HTTPException(status_code=400, detail="image_url must be valid http/https/data:image")
    if req.image_base64:
        return _build_data_uri(req.image_base64)
    raise HTTPException(status_code=400, detail="Either image_base64 or image_url is required")

def _extract_content(resp_json: dict) -> str:
    content = resp_json.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, list):
        text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
        return " ".join(text_parts)
    return content if isinstance(content, str) else ""

def _parse_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```json"):
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif content.startswith("```"):
        content = content.split("```", 1)[1].split("```", 1)[0].strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"error": "Failed to parse JSON", "raw": content}


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _coerce_string_list(value: object) -> list[str]:
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return []
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            items = [part.strip() for part in cleaned.split(",")]
        else:
            items = parsed if isinstance(parsed, list) else [cleaned]
    else:
        return []
    normalized: list[str] = []
    for item in items:
        text = _clean_text(item)
        if text and text not in normalized:
            normalized.append(text)
    return normalized


def _coerce_object_details(value: object) -> list[dict[str, object]]:
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return []
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return []
        raw_items = parsed if isinstance(parsed, list) else []
    else:
        return []
    normalized: list[dict[str, object]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        label = _clean_text(item.get("label"))
        if not label:
            continue
        count_value = item.get("count", 1)
        count = count_value if isinstance(count_value, int) and count_value > 0 else 1
        importance = _clean_text(item.get("importance")).lower()
        if importance not in {"high", "medium", "low"}:
            importance = "medium"
        attributes = _coerce_string_list(item.get("attributes", []))
        normalized.append(
            {
                "label": label,
                "count": count,
                "importance": importance,
                "attributes": attributes,
            }
        )
    return normalized


def _build_fallback_summary_detailed(
    caption: str,
    summary_short: str,
    layout: str,
    style: str,
    scene_type: str,
    objects: list[str],
    ocr_text: str,
    topics: list[str],
    entities: list[str],
) -> str:
    lead = summary_short or caption or "Visual reference."
    details: list[str] = []
    if scene_type:
        details.append(f"Scene type: {scene_type}.")
    if layout:
        details.append(f"Layout: {layout}.")
    if style:
        details.append(f"Style: {style}.")
    if objects:
        details.append(f"Key objects: {', '.join(objects[:8])}.")
    if topics:
        details.append(f"Topics: {', '.join(topics[:6])}.")
    if entities:
        details.append(f"Entities: {', '.join(entities[:6])}.")
    if ocr_text:
        ocr_preview = " ".join(ocr_text.split())[:220]
        details.append(f"OCR preview: {ocr_preview}.")
    combined = " ".join([lead, *details]).strip()
    return combined


def _derive_name(analysis: dict[str, object], fallback_name: str | None = None) -> str:
    explicit_fallback = _clean_text(fallback_name)
    provided_name = _clean_text(analysis.get("name"))
    summary_short = _clean_text(analysis.get("summary_short"))
    caption = _clean_text(analysis.get("caption"))
    objects = _coerce_string_list(analysis.get("objects", []))
    if provided_name:
        return provided_name
    if explicit_fallback:
        return explicit_fallback
    if summary_short:
        return summary_short[:120]
    if caption:
        return caption[:120]
    if objects:
        return f"{objects[0]} reference"
    return "Visual reference"


def _normalize_analysis(raw_analysis: dict[str, object], fallback_name: str | None = None) -> dict[str, object]:
    caption = _clean_text(raw_analysis.get("caption"))
    summary_short = _clean_text(raw_analysis.get("summary_short")) or caption
    ocr_text = _clean_text(raw_analysis.get("ocr_text"))
    layout = _clean_text(raw_analysis.get("layout"))
    style = _clean_text(raw_analysis.get("style"))
    scene_type = _clean_text(raw_analysis.get("scene_type"))
    layout_regions = _coerce_string_list(raw_analysis.get("layout_regions", []))
    objects = _coerce_string_list(raw_analysis.get("objects", []))
    objects_detailed = _coerce_object_details(raw_analysis.get("objects_detailed", []))
    if not objects and objects_detailed:
        objects = [str(item.get("label", "")).strip() for item in objects_detailed if str(item.get("label", "")).strip()]
    topics = _coerce_string_list(raw_analysis.get("topics", []))
    entities = _coerce_string_list(raw_analysis.get("entities", []))
    key_phrases = _coerce_string_list(raw_analysis.get("key_phrases", []))
    summary_detailed = _clean_text(raw_analysis.get("summary_detailed"))
    if not summary_detailed:
        summary_detailed = _build_fallback_summary_detailed(
            caption=caption,
            summary_short=summary_short,
            layout=layout,
            style=style,
            scene_type=scene_type,
            objects=objects,
            ocr_text=ocr_text,
            topics=topics,
            entities=entities,
        )

    normalized = {
        "name": _derive_name(raw_analysis, fallback_name=fallback_name),
        "caption": caption,
        "summary_short": summary_short,
        "summary_detailed": summary_detailed,
        "ocr_text": ocr_text,
        "layout": layout,
        "layout_regions": layout_regions,
        "scene_type": scene_type,
        "style": style,
        "objects": objects,
        "objects_detailed": objects_detailed,
        "topics": topics,
        "entities": entities,
        "key_phrases": key_phrases,
    }
    return normalized


def _build_reference_analysis(reference: dict[str, object]) -> dict[str, object]:
    normalized = _normalize_analysis(reference, fallback_name=_clean_text(reference.get("name")))
    stored_analysis = reference.get("analysis_json")
    if isinstance(stored_analysis, dict):
        merged = dict(stored_analysis)
        merged.update(normalized)
        return merged
    return normalized


def _build_rate_limited_fallback_analysis(req: AnalyzeRequest) -> dict[str, object]:
    source_hint = _clean_text(req.image_url) or "uploaded image"
    fallback = {
        "name": "Rate-limited visual reference",
        "caption": "Visual analysis provider is temporarily rate-limited. Image was accepted for fallback processing.",
        "summary_short": "Temporary fallback analysis due to upstream model rate limits.",
        "summary_detailed": (
            "The image input was received successfully, but the upstream vision model returned HTTP 429 "
            "(rate limit). This fallback record preserves a complete structured schema so the reference can "
            "still be saved and queried. Re-run analyze_image later to enrich OCR, object detection, and fine details."
        ),
        "ocr_text": "",
        "layout": "unknown",
        "layout_regions": ["full_image"],
        "scene_type": "unknown",
        "style": "unknown",
        "objects": ["image"],
        "objects_detailed": [
            {
                "label": "image",
                "count": 1,
                "importance": "high",
                "attributes": ["fallback", "rate_limited"],
            }
        ],
        "topics": ["rate_limit_fallback", "visual_memory"],
        "entities": [source_hint[:120]] if source_hint else [],
        "key_phrases": ["provider 429", "fallback analysis", "retry recommended"],
    }
    return _normalize_analysis(fallback, fallback_name="Rate-limited visual reference")

@app.post("/analyze-image", response_model=AnalyzeResponse)
async def analyze_image(req: AnalyzeRequest):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")
    b64_uri = _resolve_image_input(req)
    payload = {
        "model": req.model or DEFAULT_MODEL,
        "temperature": 0,
        "max_tokens": 2200,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a strict visual memory extraction engine. Return ONLY valid JSON with this exact schema: "
                    "{\"name\":str,\"caption\":str,\"summary_short\":str,\"summary_detailed\":str,\"ocr_text\":str,"
                    "\"layout\":str,\"layout_regions\":[str],\"scene_type\":str,\"style\":str,"
                    "\"objects\":[str],\"objects_detailed\":[{\"label\":str,\"count\":int,\"importance\":\"high|medium|low\",\"attributes\":[str]}],"
                    "\"topics\":[str],\"entities\":[str],\"key_phrases\":[str]}. "
                    "Rules: include all keys, keep empty strings/lists when unknown, no markdown, no extra keys."
                )
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": req.prompt},
                    {"type": "image_url", "image_url": {"url": b64_uri}}
                ]
            }
        ]
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "Visual Memory Agent"),
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {e}")
    if resp.status_code == 429:
        fallback_analysis = _build_rate_limited_fallback_analysis(req)
        return AnalyzeResponse(**fallback_analysis)
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    try:
        response_json = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="OpenRouter returned invalid JSON")
    parsed = _parse_json(_extract_content(response_json))
    if "error" in parsed:
        raise HTTPException(status_code=502, detail=parsed["error"])
    try:
        normalized_analysis = _normalize_analysis(parsed)
        return AnalyzeResponse(**normalized_analysis)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Invalid analysis response format: {e}")

@app.post("/create-reference", response_model=CreateReferenceResponse)
async def create_reference(req: CreateReferenceRequest):
    try:
        image_uri = req.image_uri or _try_local_image_uri_from_url(req.image_url)
        image_bytes = _decode_image_to_bytes(req.image_base64, req.image_url, image_uri)
    except HTTPException as error:
        raise error

    analysis: dict[str, object] | str = req.analysis
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except json.JSONDecodeError:
            analysis = {}
    normalized_analysis = _normalize_analysis(analysis, fallback_name=req.reference_name)

    image_hash = compute_hash(image_bytes)
    existing = check_duplicate_hash(image_hash)

    if existing:
        return CreateReferenceResponse(
            reference_id=existing["reference_id"],
            version=existing["version"],
            reference_key=_build_reference_key(existing["reference_id"], existing["version"]),
            is_duplicate=True,
            message="Image already exists in memory. Returning existing reference.",
            image_uri=existing["image_uri"],
            image_url=_build_public_image_url(existing.get("image_uri"), existing.get("image_hash")),
        )

    reference_id = get_next_reference_id()
    version = "v1"
    image_uri = save_image(image_bytes, reference_id, version)

    insert_reference(
        reference_id=reference_id,
        version=version,
        name=str(normalized_analysis.get("name", "")).strip(),
        image_hash=image_hash,
        image_uri=image_uri,
        analysis=normalized_analysis,
        user_id=req.user_id,
    )

    return CreateReferenceResponse(
        reference_id=reference_id,
        version=version,
        reference_key=_build_reference_key(reference_id, version),
        is_duplicate=False,
        message="Reference created successfully.",
        image_uri=image_uri,
        image_url=_build_public_image_url(image_uri, image_hash),
    )

@app.post("/create-new-version", response_model=CreateNewVersionResponse)
async def create_new_version(req: CreateNewVersionRequest):
    reference_id = req.reference_id.strip()
    if not reference_id:
        raise HTTPException(status_code=400, detail="reference_id is required")
    latest_reference = get_latest_reference(reference_id)
    if not latest_reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    try:
        image_uri = req.image_uri or _try_local_image_uri_from_url(req.image_url)
        image_bytes = _decode_image_to_bytes(req.image_base64, req.image_url, image_uri)
    except HTTPException as error:
        raise error
    analysis: dict[str, object] | str = req.analysis
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except json.JSONDecodeError:
            analysis = {}
    latest_name = _clean_text(latest_reference.get("name"))
    normalized_analysis = _normalize_analysis(analysis, fallback_name=latest_name)
    image_hash = compute_hash(image_bytes)
    duplicate = check_duplicate_hash(image_hash)
    if duplicate:
        same_reference = duplicate["reference_id"] == reference_id
        if same_reference:
            return CreateNewVersionResponse(
                reference_id=reference_id,
                version=duplicate["version"],
                reference_key=_build_reference_key(reference_id, duplicate["version"]),
                is_duplicate=True,
                message="Image already exists in this reference version history.",
                image_uri=duplicate["image_uri"],
                image_url=_build_public_image_url(duplicate.get("image_uri"), duplicate.get("image_hash")),
                previous_version=latest_reference.get("version"),
                duplicate_reference_id=duplicate["reference_id"],
                duplicate_version=duplicate["version"],
            )
        if req.move_if_duplicate:
            moved_record = move_duplicate_to_reference(
                source_reference_id=duplicate["reference_id"],
                source_version=duplicate["version"],
                target_reference_id=reference_id,
                user_id=req.user_id or latest_reference.get("user_id"),
            )
            if not moved_record:
                raise HTTPException(
                    status_code=409,
                    detail=f"Image already exists as {duplicate['reference_id']} {duplicate['version']}",
                )
            moved_version = str(moved_record["version"])
            moved_reference_id = str(moved_record["reference_id"])
            moved_image_uri = str(moved_record.get("image_uri") or "")
            moved_image_hash = str(moved_record.get("image_hash") or "")
            old_image_uri = str(duplicate.get("image_uri") or "")
            if old_image_uri and moved_image_uri and old_image_uri == moved_image_uri:
                try:
                    source_bytes = load_image(old_image_uri)
                    rewritten_image_uri = save_image(source_bytes, moved_reference_id, moved_version)
                    update_reference_image_uri(moved_reference_id, moved_version, rewritten_image_uri)
                    if rewritten_image_uri != old_image_uri:
                        delete_image(old_image_uri)
                    moved_image_uri = rewritten_image_uri
                except FileNotFoundError:
                    moved_image_uri = moved_image_uri
                except OSError:
                    moved_image_uri = moved_image_uri
            return CreateNewVersionResponse(
                reference_id=moved_reference_id,
                version=moved_version,
                reference_key=_build_reference_key(moved_reference_id, moved_version),
                is_duplicate=False,
                message=(
                    f"Moved existing image from {duplicate['reference_id']} {duplicate['version']} "
                    f"to {moved_reference_id} {moved_version}."
                ),
                image_uri=moved_image_uri,
                image_url=_build_public_image_url(moved_image_uri, moved_image_hash),
                previous_version=latest_reference.get("version"),
                duplicate_reference_id=duplicate["reference_id"],
                duplicate_version=duplicate["version"],
            )
        raise HTTPException(
            status_code=409,
            detail=f"Image already exists as {duplicate['reference_id']} {duplicate['version']}",
        )
    next_version = get_next_version(reference_id)
    image_uri = save_image(image_bytes, reference_id, next_version)
    insert_reference(
        reference_id=reference_id,
        version=next_version,
        name=str(normalized_analysis.get("name", "")).strip() or latest_name,
        image_hash=image_hash,
        image_uri=image_uri,
        analysis=normalized_analysis,
        user_id=req.user_id or latest_reference.get("user_id"),
        previous_version_id=latest_reference.get("version"),
    )
    return CreateNewVersionResponse(
        reference_id=reference_id,
        version=next_version,
        reference_key=_build_reference_key(reference_id, next_version),
        is_duplicate=False,
        message="New reference version created successfully.",
        image_uri=image_uri,
        image_url=_build_public_image_url(image_uri, image_hash),
        previous_version=latest_reference.get("version"),
    )

@app.post("/get-reference", response_model=GetReferenceResponse)
async def get_reference(req: GetReferenceRequest):
    reference = fetch_reference(req.reference_id, req.version)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")
    normalized_analysis = _normalize_analysis(reference, fallback_name=_clean_text(reference.get("name")))
    stored_analysis = _build_reference_analysis(reference)
    return GetReferenceResponse(
        id=reference["id"],
        reference_id=reference["reference_id"],
        version=reference["version"],
        reference_key=_build_reference_key(reference["reference_id"], reference["version"]),
        name=normalized_analysis["name"],
        image_hash=reference["image_hash"],
        image_uri=reference["image_uri"],
        image_url=_build_public_image_url(reference.get("image_uri"), reference.get("image_hash")),
        caption=str(normalized_analysis["caption"]),
        summary_short=str(normalized_analysis["summary_short"]),
        summary_detailed=str(normalized_analysis["summary_detailed"]),
        ocr_text=str(normalized_analysis["ocr_text"]),
        layout=str(normalized_analysis["layout"]),
        layout_regions=list(normalized_analysis["layout_regions"]),
        scene_type=str(normalized_analysis["scene_type"]),
        style=str(normalized_analysis["style"]),
        objects=list(normalized_analysis["objects"]),
        objects_detailed=list(normalized_analysis["objects_detailed"]),
        topics=list(normalized_analysis["topics"]),
        entities=list(normalized_analysis["entities"]),
        key_phrases=list(normalized_analysis["key_phrases"]),
        analysis_json=stored_analysis,
        created_at=reference.get("created_at"),
        previous_version_id=reference.get("previous_version_id"),
        user_id=reference.get("user_id"),
    )

@app.post("/fuzzy-search-references", response_model=list[FuzzySearchReferenceItem])
async def fuzzy_search_references(req: FuzzySearchReferencesRequest):
    limit = max(1, min(req.limit, 100))
    references = fetch_references(req.query or "", limit)
    results = []
    for reference in references:
        normalized_analysis = _normalize_analysis(reference, fallback_name=_clean_text(reference.get("name")))
        stored_analysis = _build_reference_analysis(reference)
        results.append(
            FuzzySearchReferenceItem(
                reference_id=reference["reference_id"],
                version=reference["version"],
                reference_key=_build_reference_key(reference["reference_id"], reference["version"]),
                name=normalized_analysis["name"],
                image_uri=reference["image_uri"],
                image_url=_build_public_image_url(reference.get("image_uri"), reference.get("image_hash")),
                caption=str(normalized_analysis["caption"]),
                summary_short=str(normalized_analysis["summary_short"]),
                summary_detailed=str(normalized_analysis["summary_detailed"]),
                ocr_text=str(normalized_analysis["ocr_text"]),
                layout=str(normalized_analysis["layout"]),
                layout_regions=list(normalized_analysis["layout_regions"]),
                scene_type=str(normalized_analysis["scene_type"]),
                style=str(normalized_analysis["style"]),
                objects=list(normalized_analysis["objects"]),
                objects_detailed=list(normalized_analysis["objects_detailed"]),
                topics=list(normalized_analysis["topics"]),
                entities=list(normalized_analysis["entities"]),
                key_phrases=list(normalized_analysis["key_phrases"]),
                analysis_json=stored_analysis,
                created_at=reference.get("created_at"),
            )
        )
    return results

@app.post("/compare-versions", response_model=CompareVersionsResponse)
async def compare_versions(req: CompareVersionsRequest):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")
    reference_id = req.reference_id.strip()
    if not reference_id:
        raise HTTPException(status_code=400, detail="reference_id is required")
    from_record = fetch_reference(reference_id, req.from_version)
    if not from_record:
        raise HTTPException(status_code=404, detail=f"Version not found: {req.from_version}")
    to_record = fetch_reference(reference_id, req.to_version)
    if not to_record:
        raise HTTPException(status_code=404, detail=f"Version not found: {req.to_version}")
    try:
        from_image_bytes = load_image(from_record["image_uri"])
        to_image_bytes = load_image(to_record["image_uri"])
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    payload = {
        "model": req.model or DEFAULT_MODEL,
        "temperature": 0,
        "max_tokens": 1500,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a precise visual diff engine. Return ONLY valid JSON with this shape: "
                    "{\"summary\": str, \"added\": [str], \"removed\": [str], \"changed\": [str], "
                    "\"unchanged\": [str], \"confidence\": \"high|medium|low\"}. "
                    "Compare image A (older) and image B (newer)."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"{req.prompt}\n"
                            f"Reference: {reference_id}\n"
                            f"Image A (older): {req.from_version}\n"
                            f"Image B (newer): {req.to_version}\n"
                            "Return only JSON."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": _build_data_uri_from_bytes(from_image_bytes)}},
                    {"type": "image_url", "image_url": {"url": _build_data_uri_from_bytes(to_image_bytes)}},
                ],
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "Visual Memory Agent"),
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(OPENROUTER_URL, headers=headers, json=payload)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {error}")
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    try:
        response_json = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="OpenRouter returned invalid JSON")
    parsed = _parse_json(_extract_content(response_json))
    if "error" in parsed:
        raise HTTPException(status_code=502, detail=parsed["error"])
    return CompareVersionsResponse(
        reference_id=reference_id,
        from_version=req.from_version,
        to_version=req.to_version,
        comparison=parsed,
    )

@app.post("/delete-references", response_model=DeleteReferencesResponse)
async def delete_references(req: DeleteReferencesRequest):
    cleaned_ids = []
    seen_ids = set()
    for reference_id in req.reference_ids or []:
        cleaned_id = (reference_id or "").strip()
        if not cleaned_id or cleaned_id in seen_ids:
            continue
        seen_ids.add(cleaned_id)
        cleaned_ids.append(cleaned_id)
    cleaned_keys = []
    seen_keys = set()
    for reference_key in req.reference_keys or []:
        cleaned_key = (reference_key or "").strip()
        if not cleaned_key or cleaned_key in seen_keys:
            continue
        seen_keys.add(cleaned_key)
        cleaned_keys.append(cleaned_key)
    if req.delete_all and (cleaned_ids or cleaned_keys):
        raise HTTPException(status_code=400, detail="Provide either delete_all=true or specific references, not both")
    if not req.delete_all and not cleaned_ids and not cleaned_keys:
        raise HTTPException(status_code=400, detail="Provide reference_ids/reference_keys or set delete_all=true")
    delete_targets = get_delete_targets(
        reference_ids=cleaned_ids,
        reference_keys=cleaned_keys,
        delete_all=req.delete_all,
    )
    rows = delete_targets["rows"]
    failed_file_deletions: list[str] = []
    deleted_files = 0
    image_uris = {row["image_uri"] for row in rows if row.get("image_uri")}
    for image_uri in image_uris:
        try:
            deleted = delete_image(image_uri)
        except OSError:
            failed_file_deletions.append(image_uri)
            continue
        if deleted:
            deleted_files += 1
    deleted_rows = delete_reference_rows(
        reference_ids=cleaned_ids,
        reference_keys=cleaned_keys,
        delete_all=req.delete_all,
    )
    if req.delete_all:
        message = f"Deleted {deleted_rows} stored reference rows."
    else:
        requested_count = len(cleaned_ids) + len(cleaned_keys)
        found_count = len(delete_targets["reference_ids"]) + len(delete_targets["reference_keys"])
        message = f"Deleted {deleted_rows} rows across {found_count}/{requested_count} requested reference targets."
    return DeleteReferencesResponse(
        delete_all=req.delete_all,
        deleted_rows=deleted_rows,
        deleted_reference_ids=delete_targets["reference_ids"],
        deleted_reference_keys=delete_targets["reference_keys"],
        missing_reference_ids=delete_targets["missing_reference_ids"],
        missing_reference_keys=delete_targets["missing_reference_keys"],
        deleted_files=deleted_files,
        failed_file_deletions=failed_file_deletions,
        message=message,
    )

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "visual-memory-agent"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
