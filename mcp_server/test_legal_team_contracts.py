import asyncio
import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_legal_team_test", MODULE_PATH)
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


def test_rename_legal_team_uses_declared_scoped_fields(monkeypatch):
    calls = _capture_post(monkeypatch)
    ctx = object()

    result = asyncio.run(server.rename_legal_team(ctx, "team-1", "New name", "4"))

    assert result == {"legalTeamId": "team-1", "appId": "4", "legalTeamName": "New name"}
    assert calls == [(ctx, "/api/rename-legal-team/", result)]


def test_remove_legal_team_member_uses_member_identity_fields(monkeypatch):
    calls = _capture_post(monkeypatch)
    ctx = object()

    result = asyncio.run(server.remove_legal_team_member(ctx, "team-1", member_email="member@example.com", app_id="4"))

    assert result == {"legalTeamId": "team-1", "appId": "4", "memberEmail": "member@example.com"}
    assert calls == [(ctx, "/api/remove-legal-team-member/", result)]


def test_delete_legal_team_forwards_product_scope(monkeypatch):
    calls = _capture_post(monkeypatch)
    ctx = object()

    result = asyncio.run(server.delete_legal_team(ctx, "team-1", "4"))

    assert result == {"legalTeamId": "team-1", "appId": "4"}
    assert calls == [(ctx, "/api/delete-legal-team/", result)]


def test_assign_legal_team_to_case_forwards_product_scope(monkeypatch):
    calls = _capture_post(monkeypatch)
    ctx = object()

    result = asyncio.run(server.assign_legal_team_to_case(ctx, "team-1", "case-1", "4"))

    assert result == {"legalTeamId": "team-1", "appId": "4", "caseId": "case-1"}
    assert calls == [(ctx, "/api/assign-legal-team-to-case/", result)]


def test_legal_team_invite_is_reachable_and_forwards_scope(monkeypatch):
    calls = _capture_post(monkeypatch)
    ctx = object()

    result = asyncio.run(
        server.legal_team_invite(
            ctx,
            "member@example.com",
            "4",
            legal_team_id="team-1",
            case_id="company-1",
        )
    )

    assert result == {
        "email": "member@example.com",
        "appId": "4",
        "legalTeamId": "team-1",
        "caseId": "company-1",
    }
    assert calls == [(ctx, "/api/legal-team-invite/", result)]
