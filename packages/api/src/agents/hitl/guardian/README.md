# Guardian policy source and LibreChat adaptation

`upstream.ts` contains the complete, unmodified text of OpenAI Codex's
`codex-rs/core/assets/guardian/policy_template.md` and `policy.md` at commit
`6f39a47bb3b04de4c804187bfbf55edc56939aab`. Only TypeScript string escaping is
applied. Hash tests pin both texts. The source is Apache-2.0; the license is in
`../OPENAI_LICENSE`, and the upstream notice is preserved in `NOTICE`.

`../reviewerPolicy.ts` assembles the template and default security policy. It
replaces capability-sensitive sections before inserting the policy; it does not
append instructions that leave the original capability claims active.

| Section | Adaptation and reason |
| --- | --- |
| Evidence Handling | Only host-attributed human requests establish authorization. No implicit trust in developer roles, AGENTS.md filenames, delegation, connector arguments, or claimed user-input responses. The host policy itself remains trusted. |
| Investigation Guidelines | No filesystem/network tools. Required current-state evidence that is unavailable produces `ask`. Historical write arguments do not attest successful writes or current file contents. |
| Execution Environment | No assumption that the attached machine is sandboxed, development-only, or owned by the requester. Host permission checks remain authoritative. |
| Outcome Policy | Preserve `ask` and require all four JSON fields. Low/medium-risk actions must implement the user request and cannot contradict explicit restrictions. Missing essential evidence asks rather than inventing a risk assessment. |
| Security policy | Retain all upstream categories and detailed rules. Prepend mandatory LibreChat denials for credential theft, secret exfiltration, persistent security weakening, and major irreversible destruction; these override upstream exceptions. Broad secret-bearing environment/storage dumps are credential probing; ordinary service-native authentication is distinguished from exporting credentials as data. No deployment-specific trusted destinations are configured. |

The original user-authorization scoring and risk taxonomy remain intact. In
particular, authorization to run an edited file concerns permission, not proof of
its current contents; the evidence and outcome rules still require `ask` when
current contents are necessary and unverified. References in the borrowed policy
to inspection describe evidence requirements, not tools available to this model.

This prompt does not implement trusted filesystem snapshots, an immutable
cross-resume authorization ledger, MCP coverage, or a native-worker enforcement
contract. It does not resolve those host-side limitations by assertion.

## Comparison

The previous abbreviated prompt is frozen in `e2e/auto-review/baseline-policy.json`.
Run `e2e/auto-review/evaluate.mjs` with `REVIEWER_EVAL_POLICY=baseline` for that
prompt; omit the variable for the production Guardian adaptation. Both paths use
the same evidence projection, output parsing, thresholds, dataset, and Luna low
reasoning settings. Only the policy prefix changes. Reports record policy,
runtime, and dataset hashes, token usage, latency, and each case's outcome.

Run commands and label limitations are in `e2e/auto-review/README.md`. The paired
comparison is one sample per case per prompt, not a statistical estimate of
production performance. A higher manual-review rate can be intentional when a
case's benign label depends on state the reviewer cannot verify.
