"""Host-side Harbor adapter for the production LibreChat reviewer evaluator."""

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Literal

from harbor.agents.base import BaseAgent
from harbor.agents.options import AgentOptions
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


class ReviewerOptions(AgentOptions):
    policy: Literal["guardian", "baseline"] = "guardian"


class LibreChatReviewer(BaseAgent):
    options_model = ReviewerOptions

    @staticmethod
    def name() -> str:
        return "librechat-reviewer"

    def version(self) -> str:
        return "1.0.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        # The model runs on the host, with no tools or access to the container.
        pass

    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        task = json.loads(instruction)
        case_id = task["id"]
        if not re.fullmatch(r"[a-z0-9-]+", case_id):
            raise ValueError("Invalid reviewer case ID")
        root = Path(__file__).resolve().parents[3]
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        report_path = (self.logs_dir / "review.json").resolve()
        env = dict(os.environ)
        if not env.get("LIBRECHAT_SMOKE_ENV"):
            raise ValueError(
                "Set LIBRECHAT_SMOKE_ENV to an absolute .env.smoke path on the host"
            )
        env.update(
            {
                "REVIEWER_EVAL_MODEL": self.model_name or "gpt-5.6-luna",
                "REVIEWER_EVAL_POLICY": self.options.policy,
                "REVIEWER_EVAL_FILTER": f"^{case_id}$",
                "REVIEWER_EVAL_OUTPUT": str(report_path),
            }
        )
        with (self.logs_dir / "review.log").open("wb") as log:
            process = await asyncio.create_subprocess_exec(
                "node",
                "e2e/auto-review/evaluate.mjs",
                cwd=root,
                env=env,
                stdout=log,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                await asyncio.wait_for(process.wait(), timeout=75)
            finally:
                if process.returncode is None:
                    process.kill()
                    await process.wait()
        # The evaluator returns 1 for unsafe approvals too: grade its report, not its exit status.
        report = json.loads(report_path.read_text())
        if report["datasetSha256"] != task["caseSha256"] or len(report["results"]) != 1:
            raise ValueError(
                "Case changed since task generation; regenerate the Harbor dataset"
            )
        result = report["results"][0]
        available = not (
            report["summary"]["providerFailures"]
            or report["summary"]["reviewerUnavailable"]
        )
        decision = {
            "id": result["id"],
            "caseSha256": report["datasetSha256"],
            "decision": result["decision"],
            "available": available,
        }
        artifact = self.logs_dir / "decision.json"
        artifact.write_text(json.dumps(decision))
        await environment.upload_file(artifact, "/app/decision.json")
        context.n_input_tokens = report["summary"]["inputTokens"]
        context.n_output_tokens = report["summary"]["outputTokens"]
        context.metadata = {
            "policy": report["policy"],
            "policySha256": report["policySha256"],
            "runtimeSha256": report["runtimeSha256"],
            "caseSha256": report["datasetSha256"],
            "providerFailures": report["summary"]["providerFailures"],
        }
