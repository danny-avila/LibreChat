"""
JuristAI Django MCP Server
--------------------------
Wraps the django-hub REST API as MCP tools so LibreChat's chat proxy can
invoke them directly rather than routing through the intentHandler.

Run:
    uvicorn mcp_server.server:app --host 0.0.0.0 --port 8001

Required env vars:
    DJANGO_API_BASE_URL   Base URL of the django-hub API (e.g. https://api-dev.juristai.org)
    MCP_SERVER_SECRET     Optional shared secret that LibreChat includes in X-MCP-Secret
                          to gate access (leave blank to disable the check).

The server picks up the caller's Authorization header (Bearer <token>) from the
MCP request context and forwards it verbatim to every Django endpoint so Django's
normal JWT auth applies.
"""

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import Context
from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

DJANGO_API_BASE_URL = os.getenv("DJANGO_API_BASE_URL", "https://api-dev.juristai.org").rstrip("/")
MCP_SERVER_SECRET = os.getenv("MCP_SERVER_SECRET", "")
_CONNECT_TIMEOUT = float(os.getenv("MCP_DJANGO_CONNECT_TIMEOUT", "5"))
_READ_TIMEOUT = float(os.getenv("MCP_DJANGO_READ_TIMEOUT", "60"))
_SERIESAI_APP_IDS = frozenset({"3", "4"})


# ---------------------------------------------------------------------------
# FastMCP instance
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "juristai-django",
    instructions=(
        "Tools for the JuristAI legal platform. "
        "Always supply caseId when the tool requires it. "
        "Prefer read-only tools unless the user explicitly requests a mutation."
    ),
)


# ---------------------------------------------------------------------------
# HTTP helper — forwards the caller's auth token to django-hub
# ---------------------------------------------------------------------------


def _client(token: str | None) -> httpx.AsyncClient:
    headers: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = token if token.startswith("Bearer ") else f"Bearer {token}"
    return httpx.AsyncClient(
        base_url=DJANGO_API_BASE_URL,
        headers=headers,
        timeout=httpx.Timeout(_CONNECT_TIMEOUT, read=_READ_TIMEOUT),
        follow_redirects=True,
    )


def _token(ctx: Context) -> str | None:
    request_context = getattr(ctx, "request_context", None)
    request = getattr(request_context, "request", None)
    headers = getattr(request, "headers", None)
    if headers is None:
        return None
    auth = headers.get("authorization") or headers.get("Authorization")
    return auth or None


# django-hub mounts jurist_backend.core.urls at /api/core/ (config/urls.py); a
# bare /api/<path> falls through the catch-all api_proxy_view and 404s with
# "Unsupported proxy path" instead of reaching the real view. /api/billing/
# and /api/schema/ are separate top-level mounts and must NOT be rewritten.
_BARE_API_PREFIX_EXCEPTIONS = ("/api/billing/", "/api/schema/", "/api/core/")


def _resolve_path(path: str) -> str:
    if path.startswith(_BARE_API_PREFIX_EXCEPTIONS):
        return path
    if path.startswith("/api/"):
        return f"/api/core/{path.removeprefix('/api/')}"
    return path


async def _get(ctx: Context, path: str, params: dict | None = None) -> dict[str, Any]:
    async with _client(_token(ctx)) as c:
        r = await c.get(_resolve_path(path), params={k: v for k, v in (params or {}).items() if v is not None})
        r.raise_for_status()
        return r.json()


async def _post(ctx: Context, path: str, body: dict) -> dict[str, Any]:
    async with _client(_token(ctx)) as c:
        r = await c.post(_resolve_path(path), content=json.dumps(body))
        r.raise_for_status()
        return r.json()


def _seriesai_litigation_block(app_id: str | None, operation: str) -> dict[str, str] | None:
    if str(app_id or "").strip() not in _SERIESAI_APP_IDS:
        return None
    return {
        "error": "This litigation workflow is not available for SeriesAI.",
        "code": "SERIESAI_LITIGATION_WORKFLOW_UNAVAILABLE",
        "operation": operation,
    }


async def _patch(ctx: Context, path: str, body: dict) -> dict[str, Any]:
    async with _client(_token(ctx)) as c:
        path = _resolve_path(path)
        r = await c.patch(path, content=json.dumps(body))
        r.raise_for_status()
        return r.json()


async def _delete(ctx: Context, path: str, params: dict | None = None) -> dict[str, Any]:
    async with _client(_token(ctx)) as c:
        r = await c.delete(
            _resolve_path(path),
            params={k: v for k, v in (params or {}).items() if v is not None},
        )
        r.raise_for_status()
        return r.json() if r.content else {"status": "deleted"}


# ===========================================================================
# READ tools (Milestone 1 + supplemental read-only)
# ===========================================================================


@mcp.tool(description="List the cases assigned to the authenticated user.")
async def list_my_cases(ctx: Context) -> dict:
    return await _get(ctx, "/api/my-cases/")


@mcp.tool(description="Fetch core metadata, caption, and status for a specific case.")
async def get_case_metadata(ctx: Context, case_id: str) -> dict:
    return await _post(ctx, "/api/get-case-metadata/", {"caseId": case_id})


@mcp.tool(description="List action items and recommendations for a case.")
async def list_action_items(
    ctx: Context,
    case_id: str,
    status: str | None = None,
    assignee_id: str | None = None,
) -> dict:
    return await _get(ctx, "/api/action-items/", {"caseId": case_id, "status": status, "assigneeId": assignee_id})


def _set_payload_value(payload: dict[str, object], key: str, value: object) -> None:
    if value is not None:
        payload[key] = value


@mcp.tool(description="Bulk update or delete matching action items for a case.")
async def bulk_edit_case_action_items(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    operation: str,
    search_text: str | None = None,
    current_status: str | None = None,
    filter_status: str | None = None,
    priority: str | None = None,
    assignee: str | None = None,
    apply_to_all: bool | None = None,
    status: str | None = None,
    completed: bool | None = None,
    completion_reason: str | None = None,
    actual_minutes: int | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "operation": operation}
    optional_values = (
        ("searchText", search_text),
        ("currentStatus", current_status),
        ("filterStatus", filter_status),
        ("priority", priority),
        ("assignee", assignee),
        ("applyToAll", apply_to_all),
        ("status", status),
        ("completed", completed),
        ("completionReason", completion_reason),
        ("actualMinutes", actual_minutes),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/action-items/bulk/", payload)


@mcp.tool(description="Create, update, or delete one case action item with legacy-style target resolution.")
async def edit_case_action_items(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    operation: str,
    item_id: str | None = None,
    title: str | None = None,
    description: str | None = None,
    contains: str | None = None,
    status: str | None = None,
    completed: bool | None = None,
    priority: str | None = None,
    assignee: str | None = None,
    assignee_email: str | None = None,
    assignee_user_id: str | None = None,
    suggested_due_date: str | None = None,
    date: str | None = None,
    estimated_minutes: int | None = None,
    actual_minutes: str | None = None,
    hourly_rate: str | None = None,
    completion_reason: str | None = None,
    source: str | None = None,
    parent_task_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "operation": operation}
    optional_values = (
        ("itemId", item_id),
        ("title", title),
        ("description", description),
        ("contains", contains),
        ("status", status),
        ("completed", completed),
        ("priority", priority),
        ("assignee", assignee),
        ("assigneeEmail", assignee_email),
        ("assigneeUserId", assignee_user_id),
        ("suggestedDueDate", suggested_due_date),
        ("date", date),
        ("estimatedMinutes", estimated_minutes),
        ("actualMinutes", actual_minutes),
        ("hourlyRate", hourly_rate),
        ("completionReason", completion_reason),
        ("source", source),
        ("parentTaskId", parent_task_id),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/edit-case-action-items/", payload)


@mcp.tool(description="List deadlines and important dates for a case.")
async def list_case_important_dates(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, "/api/case-important-dates/", {"caseId": case_id})


@mcp.tool(description="List calendar-style upcoming events and deadlines for a case.")
async def get_case_calendar(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, "/api/case-calendar/", {"caseId": case_id})


@mcp.tool(description="Fetch docket timeline entries for a case.")
async def list_case_timeline(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, "/api/case-timeline/", {"caseId": case_id})


@mcp.tool(description="Fetch the most recent docket entry for a case.")
async def get_latest_docket_entry(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, "/api/latest-docket-entry/", {"caseId": case_id})


@mcp.tool(
    description=(
        "Retrieve a billing summary for a case. Returns billableTaskCount and summaryText, "
        "where summaryText is a JSON-encoded digest with billingHeader, overview metrics, "
        "topBillers, topTasks, missedOpportunities (completed work not billed, e.g. no hourly "
        "rate set or no time logged), upcoming work due in the next 7 days, and a plainText "
        "field. Quote the plainText field when summarizing for the user."
    ),
)
async def retrieve_case_billing_summary(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, f"/api/core/billing/cases/{case_id}/summary")


@mcp.tool(description="List members of a legal team.")
async def list_legal_team_members(ctx: Context, legal_team_id: str) -> dict:
    return await _get(ctx, "/api/legal-team-members/", {"legalTeamId": legal_team_id})


@mcp.tool(description="List members of the current user's organization.")
async def list_organization_members(ctx: Context) -> dict:
    return await _get(ctx, "/api/organization-members/")


@mcp.tool(description="Answer questions about people involved in a case using dossier metadata.")
async def read_people_dossiers(
    ctx: Context,
    case_id: str,
    query: str | None = None,
    name: str | None = None,
    email: str | None = None,
    include_all: bool = False,
    app_id: str | None = None,
) -> dict:
    """Read a case person's dossier using the API's supported lookup fields.

    ``query`` remains a compatibility alias for existing MCP callers, while
    the API receives the supported ``name``/``email`` fields and app scope.
    """
    body = {"caseId": case_id}
    resolved_name = name or query
    if resolved_name is not None:
        body["name"] = resolved_name
    if email is not None:
        body["email"] = email
    if include_all:
        body["includeAll"] = True
    if app_id is not None:
        body["appId"] = app_id
    return await _post(ctx, "/api/read-people-dossiers/", body)


@mcp.tool(description="Search cases and dockets by keyword or docket number.")
async def search_case(ctx: Context, query: str, app_id: str | None = None) -> dict:
    body: dict[str, str] = {"q": query}
    if app_id:
        body["appId"] = app_id
    return await _post(ctx, "/api/search-case/", body)


@mcp.tool(description="Generate a case summary artifact for a case, including strategic-summary prompts.")
async def generate_case_summary(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    query: str | None = None,
    focus: str | None = None,
    support: str | None = None,
    message: str | None = None,
) -> dict:
    payload: dict[str, str] = {"caseId": case_id}
    if query is not None:
        payload["query"] = query
    if focus is not None:
        payload["focus"] = focus
    if support is not None:
        payload["support"] = support
    if message is not None:
        payload["message"] = message
    return await _post(ctx, "/api/generate-case-summary/", payload)


@mcp.tool(description="Retrieve a previously generated case summary.")
async def retrieve_case_summary(ctx: Context, case_id: str) -> dict:
    return await _post(ctx, "/api/retrieve-case-summary/", {"caseId": case_id})


@mcp.tool(description="Search precedents and case authorities for an authenticated case.")
async def precedent_query(ctx: Context, query: str, case_id: str, app_id: str) -> dict:
    blocked = _seriesai_litigation_block(app_id, "precedent_search")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/man-search-precs/",
        {"query": query, "caseId": case_id, "appId": app_id},
    )


@mcp.tool(description="Search case documents and workspace knowledge for a case.")
async def search_documents(
    ctx: Context,
    case_id: str,
    query: str,
    top_k: int | None = None,
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "caseId": case_id,
        "docketId": case_id,
        "query": query,
    }
    if app_id is not None:
        payload["appId"] = app_id
    if top_k is not None:
        payload["top_k"] = top_k
    return await _post(ctx, "/api/rag-query-proxy/", payload)


@mcp.tool(description="List documents uploaded to the authenticated user's case workspace.")
async def list_uploaded_documents(ctx: Context, case_id: str) -> dict:
    return await _post(ctx, "/api/user-document-delivery/", {"mode": "list", "caseId": case_id})


@mcp.tool(
    description=(
        "Email one or more previously uploaded case documents to the authenticated user; "
        "multiple files are sent as a ZIP."
    ),
)
async def send_uploaded_documents(
    ctx: Context,
    case_id: str,
    file_ids: list[str] | None = None,
    zip_requested: bool | None = None,
) -> dict:
    payload: dict[str, object] = {"mode": "send", "caseId": case_id, "zip": bool(zip_requested)}
    if file_ids:
        payload["fileIds"] = file_ids
    return await _post(ctx, "/api/user-document-delivery/", payload)


@mcp.tool(description="Search case documents and return excerpt-oriented matches for a case.")
async def search_documents_for_excerpts(
    ctx: Context,
    case_id: str,
    query: str,
    top_k: int | None = None,
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "caseId": case_id,
        "docketId": case_id,
        "query": query,
    }
    if app_id is not None:
        payload["appId"] = app_id
    if top_k is not None:
        payload["top_k"] = top_k
    return await _post(ctx, "/api/rag-query-proxy/", payload)


@mcp.tool(description="Recommend the next filings to prepare for a case.")
async def recommended_filings(ctx: Context, case_id: str, app_id: str | None = None) -> dict:
    blocked = _seriesai_litigation_block(app_id, "recommended_motion")
    if blocked is not None:
        return blocked
    return await _post(ctx, "/api/generate-recommended-motion/", {"caseId": case_id, "appId": app_id})


@mcp.tool(description="Determine the current procedural posture for a case.")
async def procedural_posture(ctx: Context, case_id: str, app_id: str | None = None) -> dict:
    blocked = _seriesai_litigation_block(app_id, "procedural_posture")
    if blocked is not None:
        return blocked
    return await _post(ctx, "/api/classify-docket/", {"caseId": case_id, "appId": app_id})


@mcp.tool(description="Refresh the latest docket metadata for a case already known to JuristAI.")
async def check_docket_updates(
    ctx: Context,
    case_id: str,
    docket_id: str | None = None,
    app_id: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "docket_updates")
    if blocked is not None:
        return blocked
    payload: dict[str, object] = {"caseId": case_id}
    if docket_id is not None:
        payload["docketId"] = docket_id
    if app_id is not None:
        payload["appId"] = app_id
    return await _post(ctx, "/api/retrieve-docket-metadata/", payload)


@mcp.tool(description="List motion templates available to the authenticated user.")
async def list_motion_templates(  # noqa: PLR0913
    ctx: Context,
    app_id: str | None = None,
    side: str | None = None,
    stage: str | None = None,
    motion_slug: str | None = None,
    include_previews: bool | None = None,
    max_items_per_bucket: int | None = None,
) -> dict:
    return await _get(
        ctx,
        "/api/templates/",
        {
            "appId": app_id or "2",
            "side": side,
            "stage": stage,
            "motionSlug": motion_slug,
            "includePreviews": include_previews,
            "maxItemsPerBucket": max_items_per_bucket,
        },
    )


@mcp.tool(description="Show the latest matching motion template with a short excerpt.")
async def show_motion_template(  # noqa: PLR0913
    ctx: Context,
    side: str,
    stage: str,
    motion_slug: str,
    app_id: str | None = None,
    include_previews: bool | None = None,
    max_items_per_bucket: int | None = None,
) -> dict:
    return await _get(
        ctx,
        "/api/templates/show/",
        {
            "appId": app_id or "2",
            "side": side,
            "stage": stage,
            "motionSlug": motion_slug,
            "includePreviews": include_previews,
            "maxItemsPerBucket": max_items_per_bucket,
        },
    )


@mcp.tool(description="Templatize a source document into the motion-template store.")
async def templatize_motion_template(  # noqa: PLR0913
    ctx: Context,
    case_id: str,
    source: dict,
    app_id: str,
    dry_run: bool | None = None,
    overrides: dict | None = None,
    legal_team_ids: list[str] | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "templatize_motion")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/templates/templatize/",
        {
            "caseId": case_id,
            "appId": app_id,
            "source": source,
            "dryRun": dry_run,
            "overrides": overrides,
            "legalTeamIds": legal_team_ids,
        },
    )


@mcp.tool(description="Soft-delete the latest motion template pointer after an explicit confirmation.")
async def delete_motion_template(  # noqa: PLR0913
    ctx: Context,
    side: str,
    stage: str,
    motion_slug: str,
    app_id: str,
    confirm_delete: bool | None = None,
    max_items_per_bucket: int | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "delete_motion_template")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/templates/delete/",
        {
            "appId": app_id,
            "side": side,
            "stage": stage,
            "motionSlug": motion_slug,
            "confirmDelete": confirm_delete,
            "maxItemsPerBucket": max_items_per_bucket,
        },
    )


@mcp.tool(description="Run the general JuristAI query processor.")
async def query_processor(ctx: Context, query: str, case_id: str | None = None) -> dict:
    return await _post(ctx, "/api/query-processor/", {"query": query, "caseId": case_id})


@mcp.tool(description="Generate insight about case deadlines.")
async def deadlines_insight(ctx: Context, case_id: str, query: str | None = None) -> dict:
    return await _post(ctx, "/api/deadlines-insight/", {"caseId": case_id, "query": query})


@mcp.tool(description="Retrieve a previously generated document summary.")
async def retrieve_document_summary(ctx: Context, document_id: str, case_id: str | None = None) -> dict:
    return await _post(ctx, "/api/retrieve-document-summary/", {"documentId": document_id, "caseId": case_id})


@mcp.tool(description="Look up the signature requests for a case.")
async def list_case_signatures(ctx: Context, case_id: str) -> dict:
    return await _get(ctx, f"/api/cases/{case_id}/signatures")


@mcp.tool(description="Get detail for a specific signature request.")
async def get_signature_request_detail(ctx: Context, signature_id: str) -> dict:
    return await _get(ctx, f"/api/signatures/requests/{signature_id}")


# ===========================================================================
# MUTATION tools (Milestone 2 + supplemental mutations)
# ===========================================================================


@mcp.tool(description="Create a new action item for a case.")
async def create_action_item(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    title: str,
    description: str | None = None,
    due_date: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "title": title}
    _set_payload_value(payload, "description", description)
    _set_payload_value(payload, "suggestedDueDate", due_date)
    _set_payload_value(payload, "assignedTo", [assignee_id] if assignee_id else None)
    _set_payload_value(payload, "priority", priority)
    return await _post(ctx, "/api/action-items/", payload)


@mcp.tool(description="Update an existing action item.")
async def update_action_item(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    item_id: str,
    title: str | None = None,
    description: str | None = None,
    due_date: str | None = None,
    status: str | None = None,
    priority: str | None = None,
) -> dict:
    body: dict[str, object] = {}
    _set_payload_value(body, "title", title)
    _set_payload_value(body, "description", description)
    _set_payload_value(body, "suggestedDueDate", due_date)
    _set_payload_value(body, "status", status)
    _set_payload_value(body, "priority", priority)
    return await _patch(ctx, f"/api/action-items/{item_id}/", body)


@mcp.tool(description="Assign or reassign an action item to a user.")
async def assign_action_item(ctx: Context, item_id: str, assignee_id: str) -> dict:
    return await _post(ctx, f"/api/action-items/{item_id}/assign/", {"assigneeId": assignee_id})


@mcp.tool(description="Mark an action item as complete.")
async def complete_action_item(ctx: Context, item_id: str) -> dict:
    return await _post(ctx, f"/api/action-items/{item_id}/complete/", {})


@mcp.tool(description="Create an important date or deadline for a case.")
async def create_case_important_date(
    ctx: Context,
    case_id: str,
    title: str,
    date: str,
    description: str | None = None,
) -> dict:
    return await _post(
        ctx,
        "/api/case-important-dates/",
        {
            "caseId": case_id,
            "title": title,
            "date": date,
            "description": description,
        },
    )


@mcp.tool(description="Update an existing important date or deadline.")
async def update_case_important_date(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    deadline_id: str,
    title: str | None = None,
    date: str | None = None,
    description: str | None = None,
) -> dict:
    body = {
        k: v
        for k, v in {
            "title": title,
            "date": date,
            "description": description,
        }.items()
        if v is not None
    }
    return await _patch(ctx, f"/api/case-important-dates/{case_id}/{deadline_id}/", body)


@mcp.tool(description="Delete an important date or deadline from a case.")
async def delete_case_important_date(ctx: Context, case_id: str, deadline_id: str) -> dict:
    return await _delete(ctx, f"/api/case-important-dates/{case_id}/{deadline_id}/")


@mcp.tool(description="Create, update, or delete case deadlines with legacy-style target resolution.")
async def edit_case_important_dates(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    operation: str,
    deadline_id: str | None = None,
    label: str | None = None,
    date: str | None = None,
    contains: str | None = None,
    notes: str | None = None,
    status: str | None = None,
    completed: bool | None = None,
    source: str | None = None,
    raw_entry: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "operation": operation}
    optional_values = (
        ("deadlineId", deadline_id),
        ("label", label),
        ("date", date),
        ("contains", contains),
        ("notes", notes),
        ("status", status),
        ("completed", completed),
        ("source", source),
        ("rawEntry", raw_entry),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/edit-case-important-dates/", payload)


@mcp.tool(description="Generate or regenerate a bill for a case and billing period.")
async def generate_case_bill(ctx: Context, case_id: str, billing_period: str | None = None) -> dict:
    return await _post(ctx, f"/api/core/billing/cases/{case_id}/generate", {"billingPeriod": billing_period})


@mcp.tool(description="Export logged hours for the authenticated user's assigned firm cases.")
async def export_firm_hours(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    period: str | None = None,
    billing_week_start: str | None = None,
    billing_week_end: str | None = None,
    billing_timezone: str | None = None,
    output_format: str | None = None,
    delivery_mode: str | None = None,
    case_ids: list[str] | None = None,
) -> dict:
    payload: dict[str, object] = {}
    if period is not None:
        payload["period"] = period
    if billing_week_start is not None:
        payload["billingWeekStart"] = billing_week_start
    if billing_week_end is not None:
        payload["billingWeekEnd"] = billing_week_end
    if billing_timezone is not None:
        payload["billingTimezone"] = billing_timezone
    if output_format is not None:
        payload["outputFormat"] = output_format
    if delivery_mode is not None:
        payload["deliveryMode"] = delivery_mode
    if case_ids is not None:
        payload["caseIds"] = case_ids
    return await _post(ctx, "/api/export-firm-hours/", payload)


@mcp.tool(description="Prepare bills for the authenticated user's assigned firm cases.")
async def prepare_all_bills(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    period: str | None = None,
    billing_week_start: str | None = None,
    billing_week_end: str | None = None,
    billing_timezone: str | None = None,
    case_ids: list[str] | None = None,
) -> dict:
    payload: dict[str, object] = {}
    if period is not None:
        payload["period"] = period
    if billing_week_start is not None:
        payload["billingWeekStart"] = billing_week_start
    if billing_week_end is not None:
        payload["billingWeekEnd"] = billing_week_end
    if billing_timezone is not None:
        payload["billingTimezone"] = billing_timezone
    if case_ids is not None:
        payload["caseIds"] = case_ids
    return await _post(ctx, "/api/prepare-all-bills/", payload)


@mcp.tool(description="Send a generated invoice to the client for a case after explicit confirmation.")
async def send_client_invoice(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    *,
    case_id: str | None = None,
    bill_id: str | None = None,
    period: str | None = None,
    billing_week_start: str | None = None,
    billing_week_end: str | None = None,
    billing_timezone: str | None = None,
    client_email: str | None = None,
    client_emails: list[str] | None = None,
    confirm: bool = False,
) -> dict:
    payload = {
        "caseId": case_id,
        "billId": bill_id,
        "period": period,
        "billingWeekStart": billing_week_start,
        "billingWeekEnd": billing_week_end,
        "billingTimezone": billing_timezone,
        "clientEmail": client_email,
        "clientEmails": client_emails or [],
        "confirm": confirm,
    }
    return await _post(ctx, "/api/send-client-invoice/", payload)


@mcp.tool(description="Ask for the most valuable missing case documents for a case.")
async def request_missing_case_documents(ctx: Context, case_id: str, app_id: str | None = None) -> dict:
    return await _post(
        ctx,
        "/api/request-more-case-documents/",
        {
            "caseId": case_id,
            "appId": app_id,
        },
    )


@mcp.tool(description="Upload one or more documents into a case workspace and finalize hydration.")
async def upload_documents(
    ctx: Context,
    case_id: str,
    uploads: list[dict],
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "caseId": case_id,
        "uploads": uploads,
    }
    if app_id is not None:
        payload["appId"] = app_id
    return await _post(ctx, "/api/upload-documents/", payload)


@mcp.tool(description="Update the authenticated user's hourly billing rate.")
async def update_user_hourly_rate(ctx: Context, hourly_rate: float) -> dict:
    return await _post(ctx, "/api/update-user-hourly-rate/", {"hourlyRate": hourly_rate})


@mcp.tool(description="Accept a pending legal team invite for the authenticated user.")
async def accept_legal_team_invite(ctx: Context, invite_id: str) -> dict:
    return await _post(ctx, "/api/accept-legal-team-invite/", {"token": invite_id})


@mcp.tool(description="Rename a legal team (admin only).")
async def rename_legal_team(ctx: Context, legal_team_id: str, name: str, app_id: str | None = None) -> dict:
    return await _post(
        ctx,
        "/api/rename-legal-team/",
        {"legalTeamId": legal_team_id, "appId": app_id or "2", "legalTeamName": name},
    )


@mcp.tool(description="Remove a member from a legal team by user id or email (admin only).")
async def remove_legal_team_member(
    ctx: Context,
    legal_team_id: str,
    member_user_id: str | None = None,
    member_email: str | None = None,
    app_id: str | None = None,
) -> dict:
    body = {
        "legalTeamId": legal_team_id,
        "appId": app_id or "2",
        "memberUserId": member_user_id,
        "memberEmail": member_email,
    }
    return await _post(ctx, "/api/remove-legal-team-member/", {k: v for k, v in body.items() if v is not None})


@mcp.tool(description="Assign all members of a legal team to a case (admin only).")
async def assign_legal_team_to_case(ctx: Context, legal_team_id: str, case_id: str, app_id: str | None = None) -> dict:
    return await _post(
        ctx,
        "/api/assign-legal-team-to-case/",
        {"legalTeamId": legal_team_id, "appId": app_id or "2", "caseId": case_id},
    )


@mcp.tool(description="Invite a collaborator to join a legal team.")
async def legal_team_invite(
    ctx: Context,
    email: str,
    app_id: str,
    legal_team_id: str | None = None,
    case_id: str | None = None,
) -> dict:
    payload = {
        "email": email,
        "appId": app_id,
        "legalTeamId": legal_team_id,
        "caseId": case_id,
    }
    return await _post(ctx, "/api/legal-team-invite/", {k: v for k, v in payload.items() if v is not None})


@mcp.tool(description="Delete a legal team (admin only).")
async def delete_legal_team(ctx: Context, legal_team_id: str, app_id: str | None = None) -> dict:
    return await _post(ctx, "/api/delete-legal-team/", {"legalTeamId": legal_team_id, "appId": app_id or "2"})


@mcp.tool(description="Assign the authenticated user (or an admin-selected user) to a case.")
async def assign_user_to_case(ctx: Context, case_id: str, user_id: str | None = None) -> dict:
    return await _post(ctx, "/api/assign-user-to-case/", {"caseId": case_id, "userId": user_id})


@mcp.tool(description="Add an existing case to a workspace or create a new matter when no docket match exists.")
async def add_case(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    docket_id: str | None = None,
    role: str | None = None,
    case_name: str | None = None,
    docket_number: str | None = None,
    support: str | None = None,
    target_user_id: str | None = None,
    target_user_email: str | None = None,
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {}
    if docket_id is not None:
        payload["docketId"] = docket_id
    if role is not None:
        payload["role"] = role
    if case_name is not None:
        payload["caseName"] = case_name
    if docket_number is not None:
        payload["docketNumber"] = docket_number
    if support is not None:
        payload["support"] = support
    if target_user_id is not None:
        payload["targetUserId"] = target_user_id
    if target_user_email is not None:
        payload["targetUserEmail"] = target_user_email
    if app_id is not None:
        payload["appId"] = app_id
    return await _post(ctx, "/api/add-case/", payload)


@mcp.tool(description="Remove the authenticated user (or an admin-selected user) from a case.")
async def remove_user_from_case(ctx: Context, case_id: str, user_id: str | None = None) -> dict:
    return await _post(ctx, "/api/remove-user-from-case/", {"caseId": case_id, "userId": user_id})


@mcp.tool(description="Invite a collaborator to join a legal team.")
async def legal_team_invite(
    ctx: Context,
    email: str,
    legal_team_id: str | None = None,
    case_id: str | None = None,
) -> dict:
    return await _post(
        ctx,
        "/api/legal-team-invite/",
        {
            "email": email,
            "legalTeamId": legal_team_id,
            "caseId": case_id,
        },
    )


@mcp.tool(description="Create a signature request for a document in a case.")
async def create_signature_request(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    signers: list[dict],
    case_id: str | None = None,
    source_type: str | None = None,
    source_artifact_id: str | None = None,
    source_file_id: str | None = None,
    source_template_id: str | None = None,
    source_download_url: str | None = None,
    document_name: str | None = None,
    description: str | None = None,
    custom_message: str | None = None,
    mode: str | None = None,
    expires_in_days: int | None = None,
) -> dict:
    payload: dict[str, object] = {"signers": signers}
    optional_values = (
        ("caseId", case_id),
        ("sourceType", source_type),
        ("sourceArtifactId", source_artifact_id),
        ("sourceFileId", source_file_id),
        ("sourceTemplateId", source_template_id),
        ("sourceDownloadUrl", source_download_url),
        ("documentName", document_name),
        ("description", description),
        ("customMessage", custom_message),
        ("mode", mode),
        ("expiresInDays", expires_in_days),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/signatures/requests", payload)


@mcp.tool(description="Send a reminder for a pending signature request.")
async def send_signature_reminder(ctx: Context, signature_id: str) -> dict:
    return await _post(ctx, f"/api/signatures/requests/{signature_id}/send-reminder", {})


@mcp.tool(description="Void (cancel) an existing signature request.")
async def void_signature_request(ctx: Context, signature_id: str) -> dict:
    return await _post(ctx, f"/api/signatures/requests/{signature_id}/void", {})


# ===========================================================================
# Workflow-starting tools (async, return a job/tracking ID)
# ===========================================================================


@mcp.tool(description="Start an async motion-generation workflow for a case.")
async def generate_motion(
    ctx: Context,
    case_id: str,
    motion_type: str,
    support: str | None = None,
    app_id: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "motion_generation")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/generate-motion/",
        {
            "caseId": case_id,
            "motionType": motion_type,
            "support": support,
            "appId": app_id,
        },
    )


@mcp.tool(description="Search case documents and workspace knowledge for a case via the generic RAG search path.")
async def rag_search(
    ctx: Context,
    case_id: str,
    query: str,
    top_k: int | None = None,
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "caseId": case_id,
        "docketId": case_id,
        "query": query,
    }
    if app_id is not None:
        payload["appId"] = app_id
    if top_k is not None:
        payload["top_k"] = top_k
    return await _post(ctx, "/api/rag-query-proxy/", payload)


@mcp.tool(description="Start an async demand-letter workflow.")
async def demand_letter(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str | None = None,
    recipient_name: str | None = None,
    recipient_email: str | None = None,
    subject_line: str | None = None,
    support: str | None = None,
    app_id: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "demand_letter")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/demand-letter/",
        {
            "caseId": case_id,
            "recipientName": recipient_name,
            "recipientEmail": recipient_email,
            "subjectLine": subject_line,
            "support": support,
            "appId": app_id,
        },
    )


@mcp.tool(description="Start an async lawsuit-generation workflow.")
async def generate_lawsuit(
    ctx: Context,
    case_id: str,
    support: str | None = None,
    app_id: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "lawsuit_generation")
    if blocked is not None:
        return blocked
    return await _post(ctx, "/api/generate-lawsuit/", {"caseId": case_id, "support": support, "appId": app_id})


@mcp.tool(description="Start an async adversarial motion workflow.")
async def adversarial(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    support: str | None = None,
    app_id: str | None = None,
    motion_type: str | None = None,
    motion_name: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "adversarial_generation")
    if blocked is not None:
        return blocked
    payload: dict[str, object] = {"caseId": case_id}
    if support is not None:
        payload["support"] = support
    if app_id is not None:
        payload["appId"] = app_id
    if motion_type is not None:
        payload["motion_type"] = motion_type
    if motion_name is not None:
        payload["motionName"] = motion_name
    return await _post(ctx, "/api/generate-adversarial-step/", payload)


@mcp.tool(description="Start an async deep-research workflow for a case.")
async def deep_research(ctx: Context, case_id: str, app_id: str | None = None) -> dict:
    blocked = _seriesai_litigation_block(app_id, "deep_research")
    if blocked is not None:
        return blocked
    return await _post(ctx, "/api/deep-research/", {"caseId": case_id, "appId": app_id})


@mcp.tool(description="Finish a draft document through the async finish-drafts workflow.")
async def finish_drafts(ctx: Context, case_id: str, document_s3_url: str, app_id: str | None = None) -> dict:
    return await _post(
        ctx,
        "/api/finish-drafts-step/",
        {"caseId": case_id, "documentS3Url": document_s3_url, "appId": app_id},
    )


@mcp.tool(description="Structure pasted or OCR-derived docket entries for a case.")
async def structure_docket_entries(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    case_id: str,
    raw_text: str | None = None,
    docket_number: str | None = None,
    app_id: str | None = None,
    source_type: str | None = None,
    ocr_bucket: str | None = None,
    ocr_key: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "appId": app_id}
    if raw_text is not None:
        payload["rawText"] = raw_text
    if docket_number is not None:
        payload["docketNumber"] = docket_number
    if source_type is not None:
        payload["sourceType"] = source_type
    if ocr_bucket is not None:
        payload["ocrBucket"] = ocr_bucket
    if ocr_key is not None:
        payload["ocrKey"] = ocr_key
    return await _post(ctx, "/api/manual-docket-structurer/", payload)


@mcp.tool(description="Generate or source an engagement letter and send it for signature.")
async def send_engagement_letter_for_signature(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    user_id: str,
    case_id: str,
    app_id: str,
    signers: list[dict],
    answers: dict | None = None,
    source_artifact_id: str | None = None,
    source_file_id: str | None = None,
    source_download_url: str | None = None,
    document_name: str | None = None,
    custom_message: str | None = None,
) -> dict:
    blocked = _seriesai_litigation_block(app_id, "engagement_letter_signature")
    if blocked is not None:
        return blocked
    return await _post(
        ctx,
        "/api/core/engagement-letter-signature/",
        {
            "userId": user_id,
            "caseId": case_id,
            "appId": app_id,
            "signers": signers,
            "answers": answers,
            "sourceArtifactId": source_artifact_id,
            "sourceFileId": source_file_id,
            "sourceDownloadUrl": source_download_url,
            "documentName": document_name,
            "customMessage": custom_message,
        },
    )


@mcp.tool(description="Generate a document summary asynchronously.")
async def summarize_document(
    ctx: Context,
    document_url: str | None = None,
    case_id: str | None = None,
    app_id: str | None = None,
    docket_entry_id: str | None = None,
    file_id: str | None = None,
    file_key: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "appId": app_id}
    if docket_entry_id is not None:
        payload["docketEntryId"] = docket_entry_id
    elif file_id is not None:
        payload["fileId"] = file_id
    elif file_key is not None:
        payload["fileKey"] = file_key
    elif document_url is not None:
        payload["fileKey"] = document_url
    return await _post(
        ctx,
        "/api/summarize-document/",
        payload,
    )


@mcp.tool(description="Critique a document for accuracy, quality, and legal soundness.")
async def doc_critique(
    ctx: Context,
    document_url: str | None = None,
    case_id: str | None = None,
    app_id: str | None = None,
    s3_links: list[str] | None = None,
    inline_text: str | None = None,
    document_name: str | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id, "appId": app_id}
    links = s3_links or ([document_url] if document_url else None)
    if links:
        payload["s3_links"] = links
    if inline_text is not None:
        payload["inline_text"] = inline_text
    if document_name is not None:
        payload["documentName"] = document_name
    return await _post(
        ctx,
        "/api/doc-critique/",
        payload,
    )


@mcp.tool(description="Generate a lawsuit recommendation based on case details.")
async def recommend_lawsuit(ctx: Context, case_id: str | None = None, support: str | None = None) -> dict:
    return await _post(ctx, "/api/recommend-lawsuit/", {"caseId": case_id, "support": support})


# ===========================================================================
# Account-manager pass-through
# ===========================================================================


@mcp.tool(description="Run account-level JuristAI workflow actions (account manager).")
async def account_manager(ctx: Context, action: str, payload: dict | None = None) -> dict:
    return await _post(ctx, "/api/account-manager/", {"action": action, **(payload or {})})


# ===========================================================================
# Scheduling tools
# ===========================================================================


@mcp.tool(description="List the authenticated host user's scheduling schedules.")
async def list_host_scheduling_schedules(ctx: Context) -> dict:
    return await _get(ctx, "/api/scheduling/schedules/")


@mcp.tool(description="Search available scheduling slots.")
async def search_scheduling_slots(ctx: Context, event_type_id: str, start_time: str, end_time: str) -> dict:
    return await _get(
        ctx,
        "/api/scheduling/slots/",
        {
            "eventTypeId": event_type_id,
            "startTime": start_time,
            "endTime": end_time,
        },
    )


@mcp.tool(description="List the authenticated host user's event types.")
async def list_host_scheduling_event_types(ctx: Context) -> dict:
    return await _get(ctx, "/api/scheduling/event-types/")


@mcp.tool(description="List the host's scheduling bookings.")
async def list_host_scheduling_bookings(ctx: Context) -> dict:
    return await _get(ctx, "/api/scheduling/bookings/")


@mcp.tool(description="Create a scheduling booking from a reservation.")
async def create_scheduling_booking(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    event_type_id: str,
    reservation_uid: str,
    reservation_token: str,
    attendee: dict,
    time_zone: str,
    guests: list[str] | None = None,
    booking_answers: dict | None = None,
) -> dict:
    payload: dict[str, object] = {
        "eventTypeId": event_type_id,
        "reservationUid": reservation_uid,
        "reservationToken": reservation_token,
        "attendee": attendee,
        "timeZone": time_zone,
    }
    _set_payload_value(payload, "guests", guests)
    _set_payload_value(payload, "bookingAnswers", booking_answers)
    return await _post(ctx, "/api/scheduling/bookings/", payload)


@mcp.tool(description="Cancel a scheduling booking.")
async def cancel_scheduling_booking(ctx: Context, booking_id: str, reason: str | None = None) -> dict:
    return await _post(ctx, f"/api/scheduling/bookings/{booking_id}/cancel/", {"reason": reason})


@mcp.tool(description="Confirm a pending scheduling booking.")
async def confirm_scheduling_booking(ctx: Context, booking_id: str, token: str | None = None) -> dict:
    payload: dict[str, object] = {}
    _set_payload_value(payload, "token", token)
    return await _post(ctx, f"/api/scheduling/bookings/{booking_id}/confirm/", payload)


@mcp.tool(description="Reschedule an existing scheduling booking onto a new reserved slot.")
async def reschedule_scheduling_booking(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    booking_id: str,
    reservation_uid: str,
    reservation_token: str,
    time_zone: str,
    token: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "reservationUid": reservation_uid,
        "reservationToken": reservation_token,
        "timeZone": time_zone,
    }
    _set_payload_value(payload, "token", token)
    return await _post(ctx, f"/api/scheduling/bookings/{booking_id}/reschedule/", payload)


@mcp.tool(description="Retry conferencing (e.g. Zoom link) provisioning for a scheduling booking.")
async def retry_scheduling_conferencing(ctx: Context, booking_id: str) -> dict:
    return await _post(ctx, f"/api/scheduling/bookings/{booking_id}/conference/retry/", {})


@mcp.tool(description="Connect the authenticated host's Zoom account for scheduling conferencing.")
async def connect_scheduling_conferencing(ctx: Context, app_id: str, set_as_default: bool | None = None) -> dict:
    payload: dict[str, object] = {"appId": app_id}
    _set_payload_value(payload, "setAsDefault", set_as_default)
    return await _post(ctx, "/api/integrations/conferencing/zoom/connect/", payload)


@mcp.tool(description="Disconnect a scheduling conferencing connection (e.g. Zoom).")
async def disconnect_scheduling_conferencing(ctx: Context, connection_id: str) -> dict:
    return await _post(ctx, f"/api/integrations/conferencing/{connection_id}/disconnect/", {})


@mcp.tool(description="Create a new scheduling event type (a bookable meeting kind).")
async def create_scheduling_event_type(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    slug: str,
    title: str,
    duration_minutes: int,
    schedule_id: str,
    location_type: str,
    legal_team_id: str | None = None,
    case_id: str | None = None,
    description: str | None = None,
    is_public: bool | None = None,
    is_active: bool | None = None,
) -> dict:
    payload: dict[str, object] = {
        "appId": app_id,
        "slug": slug,
        "title": title,
        "durationMinutes": duration_minutes,
        "scheduleId": schedule_id,
        "locationType": location_type,
    }
    optional_values = (
        ("legalTeamId", legal_team_id),
        ("caseId", case_id),
        ("description", description),
        ("isPublic", is_public),
        ("isActive", is_active),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/scheduling/event-types/", payload)


@mcp.tool(description="Update an existing scheduling event type.")
async def update_scheduling_event_type(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    event_type_id: str,
    slug: str | None = None,
    title: str | None = None,
    duration_minutes: int | None = None,
    schedule_id: str | None = None,
    location_type: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> dict:
    payload: dict[str, object] = {}
    optional_values = (
        ("slug", slug),
        ("title", title),
        ("durationMinutes", duration_minutes),
        ("scheduleId", schedule_id),
        ("locationType", location_type),
        ("description", description),
        ("isActive", is_active),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _patch(ctx, f"/api/scheduling/event-types/{event_type_id}/", payload)


@mcp.tool(description="Delete a scheduling event type.")
async def delete_scheduling_event_type(ctx: Context, event_type_id: str) -> dict:
    return await _delete(ctx, f"/api/scheduling/event-types/{event_type_id}/")


@mcp.tool(
    description="Fetch the public scheduling link for an event type slug (optionally scoped to a case/legal team).",
)
async def get_public_scheduling_link(ctx: Context, slug: str, scope_id: str | None = None) -> dict:
    path = f"/api/scheduling/links/{scope_id}/{slug}/" if scope_id else f"/api/scheduling/links/{slug}/"
    return await _get(ctx, path)


@mcp.tool(description="Create a new scheduling availability schedule for the authenticated host.")
async def create_scheduling_schedule(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    timezone: str,
    availability_rules: list[dict],
    minimum_notice_minutes: int | None = None,
    is_default: bool | None = None,
    is_active: bool | None = None,
) -> dict:
    payload: dict[str, object] = {
        "appId": app_id,
        "timezone": timezone,
        "availabilityRules": availability_rules,
    }
    optional_values = (
        ("minimumNoticeMinutes", minimum_notice_minutes),
        ("isDefault", is_default),
        ("isActive", is_active),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/scheduling/schedules/", payload)


@mcp.tool(description="Update an existing scheduling availability schedule.")
async def update_scheduling_schedule(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    schedule_id: str,
    timezone: str | None = None,
    availability_rules: list[dict] | None = None,
    minimum_notice_minutes: int | None = None,
    is_default: bool | None = None,
    is_active: bool | None = None,
) -> dict:
    payload: dict[str, object] = {}
    optional_values = (
        ("timezone", timezone),
        ("availabilityRules", availability_rules),
        ("minimumNoticeMinutes", minimum_notice_minutes),
        ("isDefault", is_default),
        ("isActive", is_active),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _patch(ctx, f"/api/scheduling/schedules/{schedule_id}/", payload)


@mcp.tool(description="Reserve a scheduling slot ahead of confirming a booking.")
async def create_scheduling_reservation(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    event_type_id: str,
    slot_start_at: str,
    slot_end_at: str,
    time_zone: str,
    attendee: dict | None = None,
) -> dict:
    payload: dict[str, object] = {
        "eventTypeId": event_type_id,
        "slotStartAt": slot_start_at,
        "slotEndAt": slot_end_at,
        "timeZone": time_zone,
    }
    _set_payload_value(payload, "attendee", attendee)
    return await _post(ctx, "/api/scheduling/slots/reservations/", payload)


@mcp.tool(description="Delete (release) a scheduling slot reservation.")
async def delete_scheduling_reservation(ctx: Context, reservation_uid: str, reservation_token: str) -> dict:
    return await _delete(
        ctx,
        f"/api/scheduling/slots/reservations/{reservation_uid}/",
        {"reservationToken": reservation_token},
    )


@mcp.tool(description="Reconcile a signature request's state with the e-signature provider.")
async def reconcile_signature_request(ctx: Context, signature_id: str) -> dict:
    return await _post(ctx, f"/api/signatures/requests/{signature_id}/reconcile", {})


@mcp.tool(description="Create a self-sign session so the authenticated user can sign their own document.")
async def create_self_sign_session(ctx: Context, signature_id: str) -> dict:
    return await _post(ctx, f"/api/signatures/requests/{signature_id}/self-sign-session", {})


@mcp.tool(description="Add a new step/collaborator to an in-progress case-add workflow.")
async def add_case_step(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    docket_id: str,
    role: str,
    user_id: str | None = None,
    target_user_id: str | None = None,
    app_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {"docketId": docket_id, "role": role}
    optional_values = (
        ("userId", user_id),
        ("targetUserId", target_user_id),
        ("appId", app_id),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/add-case-step/", payload)


@mcp.tool(description="Trigger (or re-run) AI-driven action-item generation for a case.")
async def cr_action_items_gen(
    ctx: Context,
    case_id: str,
    user_id: str | None = None,
    app_id: str | None = None,
    manual_run: bool | None = None,
) -> dict:
    payload: dict[str, object] = {"caseId": case_id}
    optional_values = (
        ("userId", user_id),
        ("appId", app_id),
        ("manualRun", manual_run),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/cr-action-items-gen/", payload)


@mcp.tool(description="Start a SAFE draft workflow for a SeriesAI investor and queue it for user approval.")
async def series_ai_trigger_safe_draft(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    organization_id: str,
    investor_name: str,
    investor_email: str,
    investment_amount: float,
    valuation_cap: float | None = None,
    discount_rate: float | None = None,
    pro_rata_rights: bool | None = None,
    round_id: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "triggerSafeDraft",
        "appId": app_id,
        "organizationId": organization_id,
        "investorName": investor_name,
        "investorEmail": investor_email,
        "investmentAmount": investment_amount,
    }
    optional_values = (
        ("valuationCap", valuation_cap),
        ("discountRate", discount_rate),
        ("proRataRights", pro_rata_rights),
        ("roundId", round_id),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Queue a round update email to SeriesAI investors, optionally including a cap table summary.")
async def series_ai_send_round_update(
    ctx: Context,
    app_id: str,
    organization_id: str,
    round_id: str,
    message: str | None = None,
    include_cap_table_summary: bool | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "sendRoundUpdate",
        "appId": app_id,
        "organizationId": organization_id,
        "roundId": round_id,
    }
    _set_payload_value(payload, "message", message)
    _set_payload_value(payload, "includeCapTableSummary", include_cap_table_summary)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Read-only query of a SeriesAI organization's committed cap table ownership.")
async def series_ai_query_cap_table_ownership(
    ctx: Context,
    app_id: str,
    organization_id: str,
    as_of: str | None = None,
    include_scenarios: bool | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "queryCapTableOwnership",
        "appId": app_id,
        "organizationId": organization_id,
    }
    _set_payload_value(payload, "asOf", as_of)
    _set_payload_value(payload, "includeScenarios", include_scenarios)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Schedule a SeriesAI compliance deadline (83(b) election, Form D, franchise tax, etc.).")
async def series_ai_schedule_compliance_deadline(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    organization_id: str,
    deadline_type: str,
    due_date: str,
    linked_object_id: str | None = None,
    linked_object_type: str | None = None,
    notes: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "scheduleComplianceDeadline",
        "appId": app_id,
        "organizationId": organization_id,
        "deadlineType": deadline_type,
        "dueDate": due_date,
    }
    optional_values = (
        ("linkedObjectId", linked_object_id),
        ("linkedObjectType", linked_object_type),
        ("notes", notes),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Request signatures on a SeriesAI document instance and queue it for user approval.")
async def series_ai_request_signatures_via_email(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    organization_id: str,
    document_instance_id: str,
    signers: list[dict],
    message: str | None = None,
    expires_in_days: int | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "requestSignaturesViaEmail",
        "appId": app_id,
        "organizationId": organization_id,
        "documentInstanceId": document_instance_id,
        "signers": signers,
    }
    _set_payload_value(payload, "message", message)
    _set_payload_value(payload, "expiresInDays", expires_in_days)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Invite an external deal participant (investor, accelerator, or deal-side lawyer) to a SeriesAI organization workspace.")
async def series_ai_invite_external_participant(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    organization_id: str,
    participant_type: str,
    organization_name: str,
    primary_contact_name: str,
    primary_contact_email: str,
    role_in_deal: str,
    access_scope: str,
    associated_round_id: str | None = None,
    expires_in_days: int | None = None,
) -> dict:
    payload: dict[str, object] = {
        "toolName": "inviteExternalParticipant",
        "appId": app_id,
        "organizationId": organization_id,
        "participantType": participant_type,
        "organizationName": organization_name,
        "primaryContactName": primary_contact_name,
        "primaryContactEmail": primary_contact_email,
        "roleInDeal": role_in_deal,
        "accessScope": access_scope,
    }
    optional_values = (
        ("associatedRoundId", associated_round_id),
        ("expiresInDays", expires_in_days),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/tools/execute/", payload)


@mcp.tool(description="Approve or reject a pending SeriesAI action (e.g. a queued SAFE draft or signature request).")
async def series_ai_resolve_pending_action(
    ctx: Context,
    request_id: str,
    app_id: str,
    organization_id: str,
    decision: str,
    approval_token: str | None = None,
) -> dict:
    payload: dict[str, object] = {
        "appId": app_id,
        "organizationId": organization_id,
        "decision": decision,
    }
    _set_payload_value(payload, "approvalToken", approval_token)
    return await _post(ctx, f"/api/pending-actions/{request_id}/resolve/", payload)


@mcp.tool(description="Create a brand-new case record.")
async def create_new_case(  # noqa: PLR0913 - MCP tool schema is intentionally flat
    ctx: Context,
    app_id: str,
    case_name: str,
    user_id: str,
    case_id: str | None = None,
    docket_id: str | None = None,
    court_id: str | None = None,
    docket_number: str | None = None,
) -> dict:
    payload: dict[str, object] = {"appId": app_id, "caseName": case_name, "userId": user_id}
    optional_values = (
        ("caseId", case_id),
        ("docketId", docket_id),
        ("courtId", court_id),
        ("docketNumber", docket_number),
    )
    for key, value in optional_values:
        _set_payload_value(payload, key, value)
    return await _post(ctx, "/api/create-new-case/", payload)


# ===========================================================================
# Starlette app wrapping FastMCP's SSE/Streamable-HTTP transport
# ===========================================================================


class SecretGateMiddleware(BaseHTTPMiddleware):
    """Reject requests that don't include the shared MCP_SERVER_SECRET when set."""

    async def dispatch(self, request: Request, call_next):
        if MCP_SERVER_SECRET:
            provided = request.headers.get("x-mcp-secret", "")
            if provided != MCP_SERVER_SECRET:
                return JSONResponse({"error": "forbidden"}, status_code=403)
        return await call_next(request)


@mcp.tool(description="Determine the current procedural posture for a case.")
async def get_procedural_posture(ctx: Context, case_id: str, app_id: str | None = None) -> dict:
    """Compatibility alias for callers using the legacy tool name."""
    return await procedural_posture(ctx, case_id, app_id)
app = mcp.streamable_http_app()

if MCP_SERVER_SECRET:
    app.add_middleware(SecretGateMiddleware)

