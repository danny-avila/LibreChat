import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_precedent_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def test_precedent_query_forwards_authenticated_query_route_and_product_scope(monkeypatch):
    calls = []

    async def fake_post(ctx, path, body):
        calls.append((ctx, path, body))
        return body

    monkeypatch.setattr(server, "_post", fake_post)
    ctx = object()

    result = asyncio.run(
        server.precedent_query(
            ctx,
            "arbitrary and capricious review",
            "case-73181283",
            "2",
        )
    )

    assert result == {
        "query": "arbitrary and capricious review",
        "caseId": "case-73181283",
        "appId": "2",
    }
    assert calls == [
        (
            ctx,
            "/api/man-search-precs/",
            {
                "query": "arbitrary and capricious review",
                "caseId": "case-73181283",
                "appId": "2",
            },
        )
    ]
