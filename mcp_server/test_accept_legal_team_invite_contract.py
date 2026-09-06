import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_invite_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


def test_accept_legal_team_invite_uses_endpoint_token_field(monkeypatch):
    calls = []

    async def fake_post(ctx, path, body):
        calls.append((ctx, path, body))
        return body

    monkeypatch.setattr(server, "_post", fake_post)
    ctx = object()

    result = asyncio.run(server.accept_legal_team_invite(ctx, "invite-token-1"))

    assert result == {"token": "invite-token-1"}
    assert calls == [(ctx, "/api/accept-legal-team-invite/", {"token": "invite-token-1"})]
