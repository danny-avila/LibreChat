# Anthropic Integration — Follow-ups, Testing & Logging Plan

Tracking work to do *after* the demo. Captures what's intentionally deferred, what should be measured, and what would meaningfully improve the system.

---

## What was built (recap)

Three operating modes, switchable via env flags. See `api/server/services/Anthropic/featureFlags.js`.

| Mode | `ENABLE_CUSTOM_SKILLS` | `ENABLE_SLIM_PROMPT` | `ENABLE_DOCUMENT_BLOCKS` | What it does |
|---|---|---|---|---|
| **Hybrid** (current demo) | `false` | `true` | `true` | Slim system prompt; Claude emits `[DOCUMENT]…[/DOCUMENT]` blocks; server filters them out of the stream and converts to `.docx` server-side; file is attached to the message via the same path Skills uses. Fast (~30-60s typical) but limited to text + headings + bullets + bold. |
| **Skills** | `true` | `true` | `false` | Anthropic provisions a sandboxed Python container per request, runs `python-docx` server-side, returns a `file_id` we download via the Files API. Capable (real tables, images, charts, multiple file types), slow (~2-3 min typical, 5-min container reservation per use). |
| **Legacy** | `false` | `false` | `false` | Full 174KB system prompt, no Skills, no auto-attach. The hover-button on assistant messages can manually convert message text → `.docx` via `POST /api/documents/docx`. |

Both Skills mode and Hybrid mode share the same final attachment pipeline (`saveBufferAsAttachment`), so the file ends up rendered identically in the chat, sidebar, and "My Files" modal regardless of how it was generated. The hover button (mode === 'student' gate) is preserved as a fallback.

---

## 1. Logging additions

Right now we have lifecycle visibility (warmup events, flag state at request start) but we lack timing data. Adding the following would let us answer "where does the time actually go?" without theorizing.

### Phase-timing log per request

In `AnthropicClient.sendCompletion`, capture:

- `t_request_start` — when sendCompletion enters
- `t_first_token` — when the first non-empty content delta arrives (use `streamHandler` to detect first push)
- `t_stream_complete` — when `processResponse` returns
- `t_artifacts_complete` — when `Promise.all(this.artifactPromises)` resolves

Emit one structured log line at the end:

```
[TIMING] user=X mode=hybrid total=Yms ttft=Yms stream=Yms artifacts=Yms input_tokens=Y cache_read=Y output_tokens=Y
```

That single line gives you a grepable timeline per request. Stick it behind a `LOG_TIMING` env flag if it's noisy.

### Token usage breakdown

Already partially captured via `recordTokenUsage`. Surface the values in the timing log: `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`. Useful for:

- Confirming the slim prompt cache is hitting
- Spotting requests that blow up output token count (verbose preamble drift)
- Cost attribution if billing tracking is needed later

### `[DOCUMENT]` parser observability

In `documentBlocks.js`, at `finalize()`:

- Log how many blocks were captured per request
- Log if the stream ended with an unterminated open marker (Claude truncated mid-block)
- Log block size in chars (helps spot suspiciously short or long generations)

Also worth: a counter for the `defensive frontend strip` path firing — if it ever fires, that means a `[DOCUMENT]` block leaked through server-side filtering, which is a bug to investigate.

### Mode mismatch alerts

If `ENABLE_DOCUMENT_BLOCKS=true` and `ENABLE_CUSTOM_SKILLS=true` are both on (which is allowed but probably not what you want — you'd be running both paths), log a `warn` once at startup.

### Container expiration tracking

In `containerCache.js`, when `invalidateWarmContainer` fires from the stale-container retry path, log it. Helps tune the cache TTL (currently 55 min) against Anthropic's actual container expiration behaviour.

---

## 2. Testing

Currently zero test coverage for the new code. Things worth covering, ordered by ROI:

### Unit tests (high value, low effort)

**`DocBlockFilter` state machine** — easy to test in isolation, lots of edge cases:

- Single block in single delta
- Block split across two deltas at every position (open marker mid-split, content mid-split, close marker mid-split)
- Multiple blocks in one stream
- Unterminated block (stream ends inside)
- Nested-looking but invalid markers (e.g., `[[DOCUMENT]]`)
- Case variations (`[Document]`, `[document]`)
- Adjacent text + block + text (verify text portions are preserved)
- Empty block (`[DOCUMENT][/DOCUMENT]`)

These are pure-function tests, no mocking needed. ~1 hour of work for solid coverage.

**`markdownToDocxBuffer`** — sanity tests that headings/bullets/bold survive roundtrip. Could be a single test that converts a small fixed sample and verifies the output is non-empty and a valid `.docx` zip.

**`featureFlags` defaults** — verify each combination of env vars resolves to the documented mode.

### Integration tests (medium value, medium effort)

**Hybrid path end-to-end** — mock Anthropic's stream API to emit a response containing a `[DOCUMENT]` block, run a fake request through `AnthropicClient.sendCompletion`, assert that:

- `responseMessage.attachments` has one entry
- The entry has a `file_id`, `filename`, `filepath`
- Visible message text doesn't contain `[DOCUMENT]` markup

**Skills path end-to-end** — same idea with a mocked code-execution stream containing a `bash_code_execution_tool_result` with a `file_id`. Mock the Files API download endpoint. Assert same attachment shape.

The shared pipeline (`saveBufferAsAttachment`) means once both paths produce attachments, downstream is identical. So the integration tests can stop at "attachment metadata exists" — no need to test the rendering layer.

### Manual regression checklist

A short checklist to run before shipping a change to either mode:

- [ ] Hybrid: simple text doc → file attaches, downloads, opens in Word
- [ ] Hybrid: doc with headings + bullets + bold → formatting survives
- [ ] Hybrid: response with no `[DOCUMENT]` block → no spurious file attached
- [ ] Hybrid: response with malformed `[DOCUMENT]` (only opening tag) → graceful, no crash
- [ ] Skills: same checks
- [ ] Legacy: hover button still produces a download
- [ ] Mode switch (env flag toggle + restart) → both modes produce expected behaviour
- [ ] Inline file pill renders + opens
- [ ] Sidebar file panel updates live (without browser refresh)
- [ ] My Files modal shows the new file
- [ ] Title generation still fires after first message in a fresh conversation

Worth building a small e2e test harness around this eventually. For now, manual.

### Failure-mode tests

Ensure these degrade gracefully:

- Anthropic 429 rate limit → backoff retries, then user-visible error after exhaustion
- Anthropic 5xx mid-stream → partial response saved, error logged, no crash
- Container provisioning failure (Skills mode) → request still completes without warm container
- Markdown→docx conversion error → `[DOCUMENT]` block was malformed somehow → log + no attachment, but the rest of the response is preserved
- File save failure (disk full, S3 down) → log, return null from `saveBufferAsAttachment`, message saved without attachment

The current code paths handle all of these but there's no automated coverage proving they continue to.

---

## 3. Follow-up improvements

Ranked roughly by impact-per-effort.

### Short-term (days)

**Trim the system prompt content.** The 174KB combined prompt has documented redundancy (verbosity rules are ~12KB on their own). The **slim prompt is still 42KB** — a content review by the educators could likely halve it without losing behavior. This compounds: smaller prompt = faster TTFT = less cache cost. Real engineering can't do this alone — it's a content/editorial pass that needs the SCBF team's input.

**Better filename inference.** Currently uses the first H1 in the markdown, falls back to "document". Could:
- Pull a teacher-supplied title from the chat (e.g., "make me a worksheet called 'Photosynthesis Notes'" → filename = `Photosynthesis_Notes.docx`)
- Or include date/student name from context

**Frontend "Generating document..." indicator.** When the stream contains a `[DOCUMENT]` block in progress (filter is in-document state), show a small UI hint that a file is being prepared. The thinking pill we already built could be repurposed.

**Multiple `[DOCUMENT]` blocks per response.** The filter already supports this — Claude could emit one assignment for educator + one for student in separate blocks. Worth verifying with a real prompt.

### Medium-term (week)

**PDF support in hybrid mode.** Currently only `.docx`. The `docx` npm library doesn't produce PDFs; we'd need either `pdfkit`, `puppeteer`-rendered HTML, or a similar approach. Or detect "make me a PDF" requests and route them to Skills mode (which has a `pdf` skill). Combined-mode routing would be the architectural improvement.

**Hybrid mode: tables.** The 23-line markdown converter doesn't handle markdown table syntax. A markdown-to-docx library upgrade (e.g., `mdast-util-from-markdown` + custom docx renderer) could add table support. Still won't reach Skills' real-table fidelity but covers more cases.

**Cap output verbosity.** Looking at recent message_start logs, output tokens were ~500 for a small worksheet — reasonable. But for larger ones, output token counts can balloon. A `max_tokens` cap or a system-prompt directive about brevity could help. Trade-off: might truncate large legitimate documents.

**Stream "type" hints to frontend.** While Claude is inside a `[DOCUMENT]` block, the user is staring at static UI. Send a periodic SSE event letting the frontend show "Building document, X% complete" or similar. Doesn't change actual time but reduces perceived dead air.

### Long-term (weeks)

**Upstream LibreChat merge.** This fork is on v0.7.8; upstream is at v0.8.5. Major architectural changes (the `packages/api` workspace restructure) make this a non-trivial merge — likely 2-4 days of conflict resolution + retesting. Worth planning for a quiet stretch.

**Tighter agent migration.** The "right" architecture for tool use in LibreChat is the Agents endpoint, not the direct Anthropic endpoint we extended. Migrating Help Others/Help Myself to be agents (with code execution as a registered tool) would let us delete most of the custom code in `AnthropicClient.js`. ~2-3 days of work, lower maintenance burden long-term.

**Skills as a richer feature.** The Skills code path is gated off but functional. If teachers want spreadsheets, multi-format outputs, charts, or data analysis, Skills is the right answer. A "Skills toggle" UI element could let power users opt in per-request, accepting the latency in exchange for capability.

---

## Quick buttons / entry-point UI

The Help Others / Help Myself tiles and the various "mode-setting" buttons (in `StudentButton.tsx`, `useStudentHelpForm.ts`, etc.) drive the user into a particular conversation flow. They're functional but rough — accumulated through several iterations and contain dead branches. Worth a focused cleanup pass.

### Known issues with the existing buttons

- **Multiple overlapping handlers.** `StudentButton.tsx` has both `handleSubmit` and `handleChange` doing nearly the same work. There's also a `StudentDetailsFormButton` referencing `findSpecByName(modelSpecs, 'TEST-help-others')` — a spec that doesn't exist in `librechat.yaml`. Dead code that should either be wired up or removed.
- **Mode reset on every page boot.** `client/src/store/mode.ts` clears `modeState` on every fresh tab boot via the `appBooted` sessionStorage flag. So if a teacher refreshes mid-conversation, mode goes to `null`, and any UI gated on `mode === 'student'` (e.g., the docx hover button) silently disappears. Either persist mode through reloads, or stop gating UI on it.
- **Inconsistent mode mapping.** `Convo.tsx` maps `spec === 'help-others'` → `setMode('student')`, `spec === 'help-myself'` → `setMode('classroom')`, etc. The semantic mapping (help-myself = classroom mode?) is non-obvious from the code. Worth documenting or renaming.
- **Conversation-name dialog flow.** There's a `ConversationNameDialog` + `useConversationNameForm` hook intended to let teachers name a conversation up-front, but the active wiring uses `StudentButton.handleSubmit` (no name dialog). Effectively unused. Decide: keep for future use, or strip.
- **Several form hooks** with similar patterns: `useStudentHelpForm`, `useGenFilesForm`, `useConversationNameForm`. Each holds its own `useForm`, navigate, recoil set, etc. Could likely consolidate to one parameterized hook.

### Quick wins

- **Remove dead `TEST-help-others` references.** Either wire the spec into `librechat.yaml` or delete the branch in `StudentDetailsFormButton`.
- **Add explicit "New worksheet" / "New lesson plan" shortcut buttons** in the chat input area. Pre-fills a structured prompt template the teacher can fill in (subject, grade, length). Removes ambiguity and helps Claude produce cleaner `[DOCUMENT]` blocks.
- **Persist `modeState`.** Currently cleared on tab boot, persisted only to localStorage in-session. Either make it persist across sessions or stop relying on it for UI gating.
- **Surface a "Need a different format?" button** on each generated `.docx` attachment — e.g. "Get this as a PDF" or "Switch to Skills mode for tables." Lets users escalate when the hybrid converter is too limited, without exposing the env flag concept.

### Bigger UX rethinks

- **Direct doc-only workflow.** Some teachers may just want "fill in a form, get a worksheet" — no chat at all. Could be a separate route: structured form → generate doc → download. Bypasses the conversational scaffold for users who already know what they want.
- **Library of generated docs per teacher.** "My Files" is generic; a "My Generated Worksheets" view that groups + searches by subject/grade/student would be more useful for teachers building a library over time.
- **Template starters.** A small set of pre-built prompt templates ("Worksheet for Grade 3 ELA, blank-fill format") teachers can pick from instead of writing from scratch.
- **Inline edit-in-place** — let teachers tweak the generated doc text in the chat before it's converted. Right now once the file is attached they have to download, edit in Word, re-upload separately.

### Things to probably leave alone

- The `<opening>` / Option A/B/C orchestration in `01-general-instructions.txt` was designed by the educators. Multiple users have asked us to keep it; don't touch without their input.
- The hover button on student-mode messages. Old, gated awkwardly, but functional fallback. Removing risks breaking flows we don't have visibility into.

---

## 4. Prompt and skill content sync (drift prevention)

There are two physically separate sources of "big prompt" content, and they're not synced. Without a plan, edits to one silently fail to reach Claude.

### The drift problem

| Source | Loaded by | Reaches Claude in… |
|---|---|---|
| `api/app/clients/prompts/assistant/01-general-instructions.txt` | `featureFlags.getSlimSystemPrompt()` reads it fresh per-request from disk | All three modes (Hybrid, Skills, Legacy) |
| `api/app/clients/prompts/assistant/02-classroom-management.txt`, `03-assignment-generation.txt` | `loadCustomConfig.resolvePromptFiles()` concatenates all `.txt` in the dir alphabetically into `promptPrefix` | Legacy only — slim-prompt swap discards them in Hybrid/Skills (`AnthropicClient.js`: `effectiveSystemMessage = slimPrompt ?? this.systemMessage`) |
| `api/app/clients/skills/kaleidoscope-*/{SKILL.md,*.md}` | Zipped + uploaded by `upload-skills.js` to Anthropic's workspace | Skills mode only, and only after a successful re-upload to that environment's workspace |

So:
- Edits to `01-…txt` → propagate on deploy. No extra step.
- Edits to `02-…txt` / `03-…txt` → land in git, have **zero runtime effect** in the active demo modes. Educator who edits these will see no change.
- Edits to `kaleidoscope-*` skill files → no effect until someone runs `node api/app/clients/skills/upload-skills.js` against the target Anthropic workspace.

Note: renaming `02-/03-` to a different extension (e.g. `.legacy.txt`) does **not** exclude them from the loader — the filter is `f.endsWith('.txt')`, so any `*.txt` still gets concatenated. Keep filenames as-is and solve via process, not naming.

### Plan: auto-upload skills on deploy

Most robust option. Make the deploy pipeline detect changes under `api/app/clients/skills/**` and re-run the upload before traffic shifts.

Sketch:

1. CI step (after tests, before deploy): diff `api/app/clients/skills/kaleidoscope-*/**` between the deploying commit and the previous deployed commit (or the live `registry.json` content baked into the running image — see below).
2. If anything changed, run `ANTHROPIC_API_KEY=$ENV_KEY node api/app/clients/skills/upload-skills.js` against the target environment's API key. The script versions automatically and updates `registry.json` in place.
3. Commit the resulting `registry.json` into the deploy artifact (image, archive, whatever the pipeline ships) — **not** into git, since it's environment-specific.
4. The running app reads `registry.json` from disk via `featureFlags.loadRegistry()`, so it just needs to be present in the deployed file tree.

Edge cases the pipeline needs to handle:
- **First deploy to a new environment** — no prior `registry.json` exists; script creates from scratch. Already supported.
- **Workspace sharing** — if dev/test/prod share one Anthropic workspace, all three see the same skill IDs. Uploading from one env effectively updates all of them. Decide upfront whether to allow that or require strict per-env separation (different Anthropic workspaces = different API keys).
- **Upload failure** — if Anthropic's `/v1/skills` endpoint is down mid-deploy, the deploy should fail closed (not ship a stale skill set). `upload-skills.js` exits non-zero on failure; the CI step should propagate that.
- **Race condition with concurrent deploys** — Anthropic versions skills automatically, so two concurrent uploads each create a new version and both register `version: 'latest'`. Probably fine, but worth verifying once.

### Registry.json handling

`registry.json` is gitignored (`api/app/clients/skills/.gitignore:3`) and per-environment. That's the right call — committing it would create cross-env confusion when skill IDs differ. But it means:

- Fresh checkout in a new environment has no registry → `getCustomSkills()` returns `[]` → Skills mode silently falls back to only the built-in `docx`/`pdf` skills (no Kaleidoscope content). Easy to miss in QA.
- Backups should include the deployed `registry.json` per env. Losing it doesn't break anything (re-running the upload regenerates it) but losing it *and* not re-running means silently degraded Skills responses.
- If the deploy pipeline doesn't auto-upload (i.e. before plan above ships), document the manual step in the runbook.

### Runbook entries to add

Until auto-upload is in place, document these for whoever is deploying:

1. After every deploy that touches `api/app/clients/skills/**`, run on the target host: `ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY node api/app/clients/skills/upload-skills.js`. Verify the resulting `registry.json` has the expected slugs.
2. After deploying to a fresh environment, always run the upload script once even if no skill files changed — the new env has no `registry.json` yet.
3. If switching `ENABLE_CUSTOM_SKILLS` from `false` to `true` and skills haven't been uploaded yet, expect Skills mode responses to lack Kaleidoscope content. Symptom: generic-feeling outputs. Fix: run the upload script.
4. Editing `02-classroom-management.txt` or `03-assignment-generation.txt` only matters in Legacy mode. For changes to reach Skills/Hybrid, edit the corresponding `kaleidoscope-*` skill files instead, then re-upload.

### Owner / when

- **Auto-upload pipeline work** — ~half day of CI work + verification. Should land before the demo is handed off to a team that will iterate on skill content.
- **Runbook entries** — can be written today; should live wherever this team's deploy docs are.

---

## 5. Known limitations (write down so they don't get rediscovered)

- **Hybrid mode markdown converter is limited** to `# heading`, `- bullet`, `**bold**`, plain text, blank lines. No tables, images, charts, special formatting.
- **No PDF support in hybrid mode.** Only `.docx`.
- **Skill content cold-start.** Container provisioning is ~10s minimum; first request in a Skills session pays this. Pre-warm helps but only for users who go through the Help Others button entry point.
- **Container TTL.** Anthropic returns `expires_at` ~1 hour after creation. We cache 55 min. Stale-container error handling exists but causes a one-time delay on the affected request.
- **`@anthropic-ai/sdk` version mismatch.** Package is `^7.43.9` declared in `client/package.json`; lockfile pins 7.43.9 (after we pinned during diagnostics). Earlier versions of the SDK lack `client.beta.files`. Our raw-fetch approach in `process.js` was the workaround. If anyone updates the SDK, the raw fetches in `process.js` and `containerCache.js` should be reconsidered to use SDK methods if available.
- **Frontend strips `[DOCUMENT]` defensively** even though server should already have. If the defensive strip ever fires, log + investigate — it means stream filtering missed something.
- **The 23-line `markdownToParagraphs`** is the canonical converter for hybrid mode. It's small but it has product implications — any change to its formatting behavior shows up in every assistant-generated `.docx`.
- **The hover button** is still gated on `mode === 'student'`. It's a fallback but only available to users who came through the Help Others tile flow with mode set. Could be ungated if needed.
- **Skills upload tooling** (`upload-skills.js`) is environment-specific. Each deployed environment (dev, test, prod) needs its own run + its own `registry.json`. Currently `registry.json` is gitignored.
- **Custom skills are workspace-scoped.** Anyone in the same Anthropic workspace sees the same skills. If the client uses one workspace for multiple environments, skill IDs are shared.

---

## 6. Quick reference: configuration

### Switching modes

Edit `.env`, restart backend.

```bash
# Demo / hybrid mode
ENABLE_CUSTOM_SKILLS=false
ENABLE_SLIM_PROMPT=true
ENABLE_DOCUMENT_BLOCKS=true

# Skills mode
ENABLE_CUSTOM_SKILLS=true
ENABLE_SLIM_PROMPT=true
ENABLE_DOCUMENT_BLOCKS=false

# Legacy mode (rollback)
ENABLE_CUSTOM_SKILLS=false
ENABLE_SLIM_PROMPT=false
ENABLE_DOCUMENT_BLOCKS=false
```

### Re-uploading custom skills

```bash
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2) node api/app/clients/skills/upload-skills.js
```

Updates `registry.json` with the new skill IDs (or new versions of existing skills).

### Useful log greps

```bash
# Mode + prompt size at each request
grep ANTHROPIC_FLAGS api/logs/*.log

# Container warmup lifecycle
grep WARMUP api/logs/*.log

# Anthropic API failures
grep "Anthropic Request" api/logs/*.log

# Failed file processing (Skills path)
grep processAnthropicFile api/logs/*.log

# Failed [DOCUMENT] conversion (Hybrid path)
grep "DOCUMENT.*conversion" api/logs/*.log
```

---

## File map

For navigation when picking up this work later.

```
api/server/services/Anthropic/
  containerCache.js              Skills container reuse (per-user 55-min cache)
  documentBlocks.js              [DOCUMENT] streaming filter (DocBlockFilter)
  featureFlags.js                Single source of truth for the 3 env flags
                                 + slim prompt loader + custom skills registry

api/server/services/Files/Anthropic/
  markdownToDocx.js              Shared markdown→docx converter
  saveAttachment.js              Shared buffer→File record→attachment pipeline
  process.js                     Skills file fetcher (uses saveAttachment)

api/server/routes/
  anthropic.js                   POST /api/anthropic/warmup (gated by ENABLE_CUSTOM_SKILLS)
  documents.js                   POST /api/documents/docx (hover button fallback)

api/app/clients/
  AnthropicClient.js             Stream loop + Skills/[DOCUMENT] integration
  skills/
    upload-skills.js             CLI to upload/update skills via /v1/skills
    registry.json                Generated; maps slug → skill_id (gitignored)
    kaleidoscope-*/              Skill source directories with SKILL.md + sub-files

api/app/clients/prompts/assistant/
  01-general-instructions.txt    Used as slim prompt when ENABLE_SLIM_PROMPT=true
  02-classroom-management.txt    Concatenated into full prompt when slim is off
  03-assignment-generation.txt   Same

client/src/components/Chat/Messages/Content/
  Container.tsx                  Renders attachments inline below message
  MessageContent.tsx             Defensive [DOCUMENT] strip
  Parts/Attachment.tsx           Routes attachment downloads (Skills path
                                 uses authenticated download; falls back to
                                 code-output URL for execute_code attachments)

client/src/hooks/
  Anthropic/useWarmupSkillsContainer.ts
                                 Frontend pre-warm trigger; backend short-
                                 circuits when Skills disabled, so this is
                                 effectively a no-op in hybrid/legacy modes
```
