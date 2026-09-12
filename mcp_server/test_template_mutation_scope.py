import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_template_scope_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def _capture_post(monkeypatch):
    calls = []

    async def fake_post(ctx, path, body):
        calls.append((ctx, path, body))
        return body

    monkeypatch.setattr(server, "_post", fake_post)
    return calls


def test_templatize_requires_and_forwards_explicit_product_scope(monkeypatch):
    calls = _capture_post(monkeypatch)
    result = asyncio.run(
        server.templatize_motion_template(
            object(), "case-1", {"fileKey": "doc-1"}, "2"
        )
    )

    assert result["appId"] == "2"
    assert calls[0][2]["appId"] == "2"


def test_delete_template_requires_and_forwards_explicit_product_scope(monkeypatch):
    calls = _capture_post(monkeypatch)
    result = asyncio.run(server.delete_motion_template(object(), "plaintiff", "pleading", "motion-1", "2"))

    assert result["appId"] == "2"
    assert calls[0][2]["appId"] == "2"
