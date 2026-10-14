# Historical MCP image replay

MCP image results are saved as assistant attachments for display. They normally
do not become image inputs on the next user turn. This opt-in reconstructs a
bounded set of recent saved MCP images when the agent prompt is assembled.

```yaml
endpoints:
  agents:
    historicalToolImages:
      enabled: true
      models:
        - your-exact-vision-model-id
      recentTurns: 1
      maxImages: 3
```

Use the exact resolved model ID, including any gateway prefix. Administrators
must list only models that support image input. Shared handoff history is enabled
only when all top-level recipient models and their configured summary models are
listed. Lazy subagents run with isolated transcripts and do not inherit these
parent previews; they use their own authorized file inputs or explicit tools.
`resendFiles: false`
disables replay. Omit this configuration or set `enabled: false` to restore the
existing behavior; no stored file or message migration is required.

Replay uses the existing authenticated owner/tenant file lookup, the active
conversation branch, and the saved producing MCP call/message association.
Canonical file metadata supplies storage paths and eligibility. Client-submitted
assistant rows are excluded, and decoded bytes must match the canonical MIME.
An attachment
snapshot cannot supply a replacement path or bypass file/content policy.
Code Interpreter output, PDFs, unrelated agent outputs, and files with delivery
explicitly disabled are excluded.

Previews are decoded and resized privately in memory. PNG previews that exceed
the byte cap are encoded as JPEG at quality 80 before omission, preserving the
bounded edge for photographic or noisy images. They are prepended to the
current user prompt with a historical-image label and file/message/tool IDs.
Persisted messages, image bytes, and file delivery metadata are unchanged.
This placement uses the existing provider formatter for user image blocks and
avoids reconstructing or duplicating old tool calls.

Defaults: one completed turn, three images, 8 MB per source, 16 MB aggregate
source reads, 16 million decoded pixels, a 1024-pixel preview edge, 1 MB per
preview, and 4096 replay tokens. Existing endpoint MIME and attachment limits
also apply. Images outside these limits require an explicit tool reopen or
upload. Missing/corrupt/oversized images are omitted with a bounded note when
possible; unexpected storage failures retain the normal safe error boundary.

## Validation and rollout

Regression tests cover selection, authorization-map absence, producing-call
associations, branch/agent exclusion, canonical metadata, actual stream bounds,
decode/pixel limits, endpoint MIME policy, reload, prompt token accounting,
nonmutation, missing-file retry, default opt-out, and `resendFiles: false`.

Before deploying, test the target provider and saved agent with fresh images
containing independently known markers. Turn one must withhold the marker from
text. Turn two must forbid tool calls and recover it from an outgoing request
containing image pixels. Repeat across backend restart, multiple images, context
pruning, and mixed-model handoffs. Do not treat visible attachments as delivery
evidence. Keep raw prompts, private paths, image bytes, and credentials out of
tracked diagnostics.

This feature provides bounded recent visual context, not an unlimited visual
archive. Older images and fine detail lost during resizing still require reopening
the original. Upstream review and provider acceptance remain required before rollout.
