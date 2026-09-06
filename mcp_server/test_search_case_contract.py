import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_search_case_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def test_search_case_forwards_declared_query_field_and_optional_product_scope(monkeypatch):
    calls = []

    async def fake_post(ctx, path, body):
        calls.append((ctx, path, body))
        return body

    monkeypatch.setattr(server, "_post", fake_post)
    ctx = object()

    result = asyncio.run(server.search_case(ctx, "KalshiEX LLC v. Knudsen", "2"))

    assert result == {"q": "KalshiEX LLC v. Knudsen", "appId": "2"}
    assert calls == [(ctx, "/api/search-case/", result)]


def test_search_case_does_not_invent_default_product_scope(monkeypatch):
    async def fake_post(_ctx, _path, body):
        return body

    monkeypatch.setattr(server, "_post", fake_post)

    assert asyncio.run(server.search_case(object(), "3:25-cv-01991")) == {
        "q": "3:25-cv-01991",
    }
