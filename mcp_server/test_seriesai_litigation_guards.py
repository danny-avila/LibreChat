"""Regression coverage for the MCP server's SeriesAI litigation boundary."""

import asyncio
import importlib.util
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("chatbot_mcp_server_seriesai_guard_test", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server)


@pytest.mark.parametrize(
    ("tool", "args", "kwargs"),
    [
        (server.precedent_query, (object(), "query", "case-1", "4"), {}),
        (server.recommended_filings, (object(), "case-1"), {"app_id": "4"}),
        (server.procedural_posture, (object(), "case-1"), {"app_id": "4"}),
        (server.check_docket_updates, (object(), "case-1"), {"app_id": "4"}),
        (server.templatize_motion_template, (object(), "case-1", {}, "4"), {}),
        (server.delete_motion_template, (object(), "side", "stage", "slug", "4"), {}),
        (server.generate_motion, (object(), "case-1", "motion"), {"app_id": "4"}),
        (server.demand_letter, (object(),), {"app_id": "4"}),
        (server.generate_lawsuit, (object(), "case-1"), {"app_id": "4"}),
        (server.adversarial, (object(), "case-1"), {"app_id": "4"}),
        (server.deep_research, (object(), "case-1"), {"app_id": "4"}),
        (
            server.send_engagement_letter_for_signature,
            (object(), "user-1", "case-1", "4", []),
            {},
        ),
    ],
)
def test_seriesai_litigation_tools_fail_closed_before_http(tool, args, kwargs, monkeypatch):
    async def unexpected_post(*_args, **_kwargs):
        raise AssertionError("SeriesAI litigation tool reached the Django API")

    monkeypatch.setattr(server, "_post", unexpected_post)

    result = asyncio.run(tool(*args, **kwargs))

    assert result["code"] == "SERIESAI_LITIGATION_WORKFLOW_UNAVAILABLE"
