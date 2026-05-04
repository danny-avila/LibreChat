import hmac
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from starlette.responses import JSONResponse

load_dotenv()

API_BASE = os.getenv("VISUAL_MEMORY_API_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
MCP_TRANSPORT = os.getenv("MCP_TRANSPORT", "sse").strip().lower()
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "8091"))
MCP_ACCESS_TOKEN = os.getenv("MCP_ACCESS_TOKEN", "").strip()
HTTP_TIMEOUT_SECONDS = int(os.getenv("VISUAL_MEMORY_API_TIMEOUT_SECONDS", "60"))
AUTO_SAVE_REFERENCE = os.getenv("VISUAL_MEMORY_AUTO_SAVE_REFERENCE", "true").strip().lower() == "true"

DEFAULT_PROMPT = (
    "Analyze this image in detail and return structured JSON including: "
    "name, caption, summary_short, summary_detailed, ocr_text, layout, layout_regions, "
    "scene_type, style, objects, objects_detailed, topics, entities, key_phrases."
)

mcp = FastMCP("visual-memory-agent", host=MCP_HOST, port=MCP_PORT)


class MCPAuthMiddleware:
    def __init__(self, app: Any):
        self.app = app

    @staticmethod
    def _extract_bearer_token(headers: dict[bytes, bytes]) -> str:
        authorization = headers.get(b"authorization", b"").decode().strip()
        if not authorization:
            return ""
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return ""
        return token.strip()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        provided_token = self._extract_bearer_token(headers)
        if not MCP_ACCESS_TOKEN or not provided_token:
            response = JSONResponse({"error": "Missing Authorization header"}, status_code=401)
            await response(scope, receive, send)
            return
        if not hmac.compare_digest(provided_token, MCP_ACCESS_TOKEN):
            response = JSONResponse({"error": "Invalid access token"}, status_code=401)
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def _normalize_version(version: str | None) -> str | None:
    cleaned = (version or "").strip().lower()
    if not cleaned:
        return None
    if cleaned.startswith("v") and cleaned[1:].isdigit():
        return f"v{int(cleaned[1:])}"
    if cleaned.isdigit():
        return f"v{int(cleaned)}"
    return version

def _add_image_markdown(reference: dict) -> dict:
    """Build image markdown only from validated API image_url. Never fabricate."""
    image_url = reference.get("image_url")
    reference_label = reference.get("reference_key") or reference.get("reference_id", "reference")
    
    if not image_url:
        reference["image"] = None
        reference["ref_id"] = reference_label
        reference["image_url"] = None
        reference.pop("image_markdown", None)
        return reference

    reference["ref_id"] = reference_label
    reference["image_url"] = image_url
    reference["image"] = f"**Reference ID:** `{reference_label}`\n\n![{reference_label}]({image_url})"
    reference.pop("image_markdown", None)
    return reference

    
@mcp.tool(
    name="analyze_image",
    description=(
        "Analyzes an uploaded image using a vision-language model. Returns structured JSON: "
        "name, summaries, OCR, layout/regions, style, objects, topics/entities. By default it also saves a persistent reference "
        "using create_reference (set save_reference=false to disable). "
        "If reference_id is provided, it saves as a new version under that reference using create_new_version. "
        "Use image_url for links or uploaded file URLs. If using image_base64, it must be full untruncated data. "
        "Routing rule: when the user sends an image/attachment, call this tool first unless the user explicitly says not to use tools."
    ),
)
async def analyze_image(
    image_base64: str | None = None,
    image_url: str | None = None,
    prompt: str = DEFAULT_PROMPT,
    model: str | None = None,
    save_reference: bool = AUTO_SAVE_REFERENCE,
    reference_name: str | None = None,
    reference_id: str | None = None,
    user_id: str | None = None,
) -> dict:
    payload = {
        "image_base64": image_base64,
        "image_url": image_url,
        "prompt": prompt,
        "model": model,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/analyze-image", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        analysis = response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}
    should_save_reference = AUTO_SAVE_REFERENCE or save_reference
    if not should_save_reference:
        return analysis
    cleaned_reference_id = (reference_id or "").strip()
    create_payload = {
        "image_base64": image_base64,
        "image_url": image_url,
        "analysis": analysis,
        "user_id": user_id,
    }
    create_endpoint = "/create-reference"
    if cleaned_reference_id:
        create_payload["reference_id"] = cleaned_reference_id
        create_endpoint = "/create-new-version"
    else:
        create_payload["reference_name"] = reference_name
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        create_response = await client.post(f"{API_BASE}{create_endpoint}", json=create_payload)
    if create_response.status_code >= 400:
        try:
            detail = create_response.json().get("detail", create_response.text)
        except ValueError:
            detail = create_response.text
        return {"error": f"visual-memory-api {create_response.status_code}: {detail}", "analysis": analysis}
    try:
        reference = create_response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON from create-reference", "analysis": analysis}
    return {
        **analysis,
        "reference": _add_image_markdown(reference),
    }

@mcp.tool(
    name="analyze_image_url",
    description=(
        "Analyzes an image directly from a public URL using a vision-language model. "
        "Use this when you have an image link and no base64 data. "
        "Preferred tool for web links and uploaded file URLs. "
        "By default it also saves a persistent reference with rich analysis fields (set save_reference=false to disable). "
        "If reference_id is provided, it saves as a new version under that reference using create_new_version. "
        "Routing rule: for image URLs, call this tool unless the user explicitly says not to use tools."
    ),
)
async def analyze_image_url(
    image_url: str,
    prompt: str = DEFAULT_PROMPT,
    model: str | None = None,
    save_reference: bool = AUTO_SAVE_REFERENCE,
    reference_name: str | None = None,
    reference_id: str | None = None,
    user_id: str | None = None,
) -> dict:
    payload = {
        "image_url": image_url,
        "prompt": prompt,
        "model": model,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/analyze-image", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        analysis = response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}
    should_save_reference = AUTO_SAVE_REFERENCE or save_reference
    if not should_save_reference:
        return analysis
    cleaned_reference_id = (reference_id or "").strip()
    create_payload = {
        "image_url": image_url,
        "analysis": analysis,
        "user_id": user_id,
    }
    create_endpoint = "/create-reference"
    if cleaned_reference_id:
        create_payload["reference_id"] = cleaned_reference_id
        create_endpoint = "/create-new-version"
    else:
        create_payload["reference_name"] = reference_name
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        create_response = await client.post(f"{API_BASE}{create_endpoint}", json=create_payload)
    if create_response.status_code >= 400:
        try:
            detail = create_response.json().get("detail", create_response.text)
        except ValueError:
            detail = create_response.text
        return {"error": f"visual-memory-api {create_response.status_code}: {detail}", "analysis": analysis}
    try:
        reference = create_response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON from create-reference", "analysis": analysis}
    return {
        **analysis,
        "reference": _add_image_markdown(reference),
    }

@mcp.tool(
    name="create_reference",
    description=(
        "Permanently saves an analyzed image + its JSON analysis to persistent storage. "
        "Returns a unique reference_id for future retrieval. "
        "Use IMMEDIATELY after analyze_image() for a brand new asset. "
        "Accepts: reference_name (optional), image_base64 OR image_url, and the analysis JSON object."
    ),
)
async def create_reference(
    reference_name: str | None = None,
    image_base64: str | None = None,
    image_url: str | None = None,
    analysis: dict | None = None,
    user_id: str | None = None,
) -> dict:
    payload = {
        "reference_name": reference_name,
        "image_base64": image_base64,
        "image_url": image_url,
        "analysis": analysis or {},
        "user_id": user_id,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/create-reference", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        return _add_image_markdown(response.json())
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

@mcp.tool(
    name="create_new_version",
    description=(
        "Creates a new version for an existing reference_id without creating a new reference. "
        "Use when user asks to update/replace an existing reference. "
        "Accepts reference_id, image_base64 OR image_url, and the new analysis JSON."
    ),
)
async def create_new_version(
    reference_id: str,
    image_base64: str | None = None,
    image_url: str | None = None,
    image_uri: str | None = None,
    analysis: dict | None = None,
    move_if_duplicate: bool = True,
    user_id: str | None = None,
) -> dict:
    payload = {
        "reference_id": reference_id,
        "image_base64": image_base64,
        "image_url": image_url,
        "image_uri": image_uri,
        "analysis": analysis or {},
        "move_if_duplicate": move_if_duplicate,
        "user_id": user_id,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/create-new-version", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        return _add_image_markdown(response.json())
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

@mcp.tool(
    name="get_reference",
    description=(
        "Retrieves a stored visual reference by reference_id and optional version. "
        "If version is omitted, returns the latest version for that reference."
    ),
)
async def get_reference(
    reference_id: str,
    version: str | None = None,
) -> dict:
    normalized_version = _normalize_version(version)
    payload = {
        "reference_id": reference_id,
        "version": normalized_version,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/get-reference", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        return _add_image_markdown(response.json())
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

@mcp.tool(
    name="fuzzy_search_references",
    description=(
        "Searches stored references by free text across name, caption, OCR text, and objects. "
        "Use this when reference_id is unknown. Empty query returns latest references."
    ),
)
async def fuzzy_search_references(
    query: str = "",
    limit: int = 10,
) -> dict:
    payload = {
        "query": query,
        "limit": limit,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/fuzzy-search-references", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        results = response.json()
        enriched_results = []
        for result in results:
            if isinstance(result, dict):
                enriched_results.append(_add_image_markdown(result))
            else:
                enriched_results.append(result)
        return {
            "count": len(enriched_results),
            "results": enriched_results,
        }
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

@mcp.tool(
    name="compare_versions",
    description=(
        "Compares two versions of the same stored reference using image-to-image VL reasoning. "
        "Provide reference_id, from_version, and to_version."
    ),
)
async def compare_versions(
    reference_id: str,
    from_version: str,
    to_version: str,
    prompt: str = "Compare these two versions and return structured differences.",
    model: str | None = None,
) -> dict:
    normalized_from_version = _normalize_version(from_version) or from_version
    normalized_to_version = _normalize_version(to_version) or to_version
    payload = {
        "reference_id": reference_id,
        "from_version": normalized_from_version,
        "to_version": normalized_to_version,
        "prompt": prompt,
        "model": model,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/compare-versions", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        return response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

@mcp.tool(
    name="delete_reference",
    description=(
        "Deletes stored references from database and associated saved files. "
        "If user says 'delete all references', call with delete_all=true. "
        "If user says 'delete ref_012' or gives multiple ids, call with reference_ids=[...]. "
        "Use this tool directly for explicit delete commands."
    ),
)
async def delete_reference(
    reference_ids: list[str] | None = None,
    reference_keys: list[str] | None = None,
    delete_all: bool = False,
) -> dict:
    payload = {
        "reference_ids": reference_ids or [],
        "reference_keys": reference_keys or [],
        "delete_all": delete_all,
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{API_BASE}/delete-references", json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        return {"error": f"visual-memory-api {response.status_code}: {detail}"}
    try:
        return response.json()
    except ValueError:
        return {"error": "visual-memory-api returned invalid JSON"}

if __name__ == "__main__":
    if MCP_TRANSPORT in {"sse", "streamable-http"}:
        import uvicorn

        app = mcp.streamable_http_app() if MCP_TRANSPORT == "streamable-http" else mcp.sse_app()
        uvicorn.run(MCPAuthMiddleware(app), host=MCP_HOST, port=MCP_PORT)
    else:
        mcp.run(transport="stdio")
