import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_billing_case_route_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def test_case_billing_tools_use_canonical_core_routes(monkeypatch):
    calls = []

    async def fake_get(ctx, path, params=None):
        calls.append(("GET", ctx, path, params))
        return {"path": path}

    async def fake_post(ctx, path, body):
        calls.append(("POST", ctx, path, body))
        return {"path": path, "body": body}

    monkeypatch.setattr(server, "_get", fake_get)
    monkeypatch.setattr(server, "_post", fake_post)
    ctx = object()

    summary = asyncio.run(server.retrieve_case_billing_summary(ctx, "case-1"))
    generated = asyncio.run(server.generate_case_bill(ctx, "case-1", "2026-08"))

    assert summary == {"path": "/api/core/billing/cases/case-1/summary"}
    assert generated == {
        "path": "/api/core/billing/cases/case-1/generate",
        "body": {"billingPeriod": "2026-08"},
    }
    assert calls == [
        ("GET", ctx, "/api/core/billing/cases/case-1/summary", None),
        ("POST", ctx, "/api/core/billing/cases/case-1/generate", {"billingPeriod": "2026-08"}),
    ]
