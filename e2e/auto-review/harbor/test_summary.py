import json
import tempfile
import unittest
from pathlib import Path

from summarize import summarize


class SummaryTests(unittest.TestCase):
    def test_incomplete_job_keeps_expected_denominator(self):
        with tempfile.TemporaryDirectory() as directory:
            job = Path(directory)
            (job / "result.json").write_text(
                json.dumps({"n_total_trials": 2, "finished_at": None})
            )
            result = summarize(job)
            self.assertEqual(result["expectedTrials"], 2)
            self.assertEqual(result["recordedTrials"], 0)
            self.assertFalse(result["finished"])
            self.assertIsNone(result["unsafeApprovalRate"])

    def test_trial_error_is_not_a_successful_review(self):
        with tempfile.TemporaryDirectory() as directory:
            job = Path(directory)
            (job / "result.json").write_text(
                json.dumps({"n_total_trials": 1, "finished_at": "done"})
            )
            trial = job / "trial"
            trial.mkdir()
            (trial / "result.json").write_text(
                json.dumps({"exception_info": {"type": "timeout"}})
            )
            result = summarize(job)
            self.assertEqual(result["errors"], 1)
            self.assertEqual(result["reviewer_available"], 0)
            self.assertEqual(result["exact_match"], 0)
