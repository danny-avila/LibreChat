# modelSpecs Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the model selector into a use.ai-style curated experience — 8 family groups, ~26 vetted models (incl. historical versions), `enforce`-locked, default Gemini 2.5 Flash — entirely via gptsapi on one key.

**Architecture:** Pure configuration. Add/fix LibreChat endpoints in `graupel.yaml.example` (committed) + `librechat.yaml` (local active) so every curated model is reachable through gptsapi, then add a `modelSpecs` block (enforce + grouped card list). LibreChat's native `ModelSelector`/`ModelSpecItem`/`SpecIcon`/`CustomGroup` render it — no new frontend code expected. No backend logic, no gating.

**Tech Stack:** YAML config (`librechat.yaml` schema, validated on backend boot by `specsConfigSchema`/endpoint schemas) · runtime verification via the running app (backend 3080 + frontend 3090) + curl.

**Spec:** [docs/superpowers/specs/2026-06-24-graupel-modelspecs-curation-design.md](../specs/2026-06-24-graupel-modelspecs-curation-design.md)

## Global Constraints

- **Single key**: every endpoint routes through gptsapi (`baseURL: https://api.gptsapi.net/v1`, `apiKey: ${GPTSAPI_KEY}`). No new API keys.
- **Two config files, same content**: `graupel.yaml.example` is the committed source of truth (the deliverable); `librechat.yaml` is gitignored local active config (for verification). Apply identical endpoint + modelSpecs changes to both.
- **Only vetted models** (verified callable 2026-06-24 — see spec §4). **Exclude** `gemini-3.5-flash` (relay "not support"), `gemini-3-pro-preview` (not served), `-cc`/`-codex`/`-code` SKUs, `gemini-2.5-flash-nothinking`.
- **enforce: true** (selector shows only curated cards), **prioritize: true**, default card = `gemini-2.5-flash` (`default: true`).
- **No gating** — cost tiers are spec annotations only; do not wire checkBillingAccess or touch MODEL_REGISTRY.
- **titleModel/summaryModel** for new custom endpoints = `gemini-2.5-flash-lite` (cheap).
- Config is validated on backend boot — a malformed yaml makes the backend fail readiness. "Backend boots clean + readiness passing" is the config-valid signal.
- The running app from prior verification is reusable: mongod (27017, libssl1.1 `LD_LIBRARY_PATH`), backend 3080, frontend 3090. Restart the backend after each config change (config loads at boot). Test user `verify@test.com` / `TestPass123!`.

## File Structure

- **Modify** `graupel.yaml.example` (committed): add 5 custom endpoints (xAI/DeepSeek/GLM/Kimi/MiniMax), normalize the OpenAI/Anthropic/Google endpoints, add the `modelSpecs` block.
- **Modify** `librechat.yaml` (local, gitignored): mirror the same.
- (Contingent) **Modify** a `client/src/components/Chat/Menus/Endpoints/*` file only if grouping/icon rendering needs a minimal tweak — not expected.

The authoritative card list (label / model id / endpoint / group / tier) is the spec's **§4 table** — copy values verbatim from there.

---

## Task 1: Endpoints — make all 8 families reachable via gptsapi

**Files:** Modify `graupel.yaml.example`, `librechat.yaml`.

**Interfaces — Produces:** live endpoints `openAI`, `anthropic`, `Google`, `xAI`, `DeepSeek`, `GLM`, `Kimi`, `MiniMax`, each serving its family's vetted models (consumed by Task 2's modelSpec presets via `preset.endpoint`).

- [ ] **Step 1: Normalize the `Google` custom endpoint** — in both yaml files, set the Google endpoint's model list to the vetted set only (remove `gemini-3.5-flash` and `gemini-3-pro-preview`):

```yaml
  custom:
    - name: 'Google'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default:
          - 'gemini-3.1-pro-preview'
          - 'gemini-3-flash-preview'
          - 'gemini-2.5-flash'
          - 'gemini-2.5-flash-lite'
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'Google'
      iconURL: 'google'
      dropParams: ['stop']
```

- [ ] **Step 2: Add the 5 new custom endpoints** — append to the `custom:` list in both yaml files:

```yaml
    - name: 'xAI'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default: ['grok-4.3', 'grok-4-1-fast-non-reasoning', 'grok-4.20-beta-0309-reasoning', 'grok-4.20-beta-0309-non-reasoning', 'grok-4.20-multi-agent-beta-0309']
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'xAI'
      iconURL: 'xai'
      dropParams: ['stop']
    - name: 'DeepSeek'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default: ['deepseek-v4-pro', 'deepseek-v4-flash']
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'DeepSeek'
      dropParams: ['stop']
    - name: 'GLM'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default: ['glm-5.2', 'glm-5-turbo']
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'GLM'
      dropParams: ['stop']
    - name: 'Kimi'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default: ['kimi-k2.6']
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'Kimi'
      dropParams: ['stop']
    - name: 'MiniMax'
      apiKey: '${GPTSAPI_KEY}'
      baseURL: 'https://api.gptsapi.net/v1'
      models:
        default: ['MiniMax-M3']
        fetch: false
      titleConvo: true
      titleModel: 'gemini-2.5-flash-lite'
      modelDisplayLabel: 'MiniMax'
      dropParams: ['stop']
```
> Confirm the built-in `openAI` + `anthropic` endpoints stay enabled via `.env` `OPENAI_REVERSE_PROXY`/`ANTHROPIC_REVERSE_PROXY` (already set to gptsapi) — no yaml endpoint block needed for them. If `graupel.yaml.example` declares explicit `openAI`/`anthropic` blocks, leave them (titleModel etc.) but do NOT add a `models` filter that would exclude the curated GPT/Claude ids.

- [ ] **Step 3: Restart backend, verify config is valid (boots clean)**

```bash
# kill old backend, restart
pkill -f "npm run backend" 2>/dev/null; sleep 2
cd /data/lidongyu/projects/LibreChat
LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" nohup npm run backend > /tmp/lc-backend.log 2>&1 &
sleep 25
grep -E "Server readiness checks passing|Server listening" /tmp/lc-backend.log && echo "CONFIG VALID ✓"
grep -iE "error.*(config|yaml|endpoint|schema)|invalid" /tmp/lc-backend.log | head
```
Expected: readiness passing, no config/schema errors. (A bad yaml → readiness fails → fix before proceeding.)

- [ ] **Step 4: Verify each new endpoint's models are reachable** — confirm via the app's models endpoint (logged-in) OR directly that gptsapi serves each (already vetted; this step catches endpoint-name/list typos):

```bash
# the curated ids were all verified callable on 2026-06-24; this re-confirms one per new endpoint
KEY=$(grep -E "^GPTSAPI_KEY=" .env | cut -d= -f2-)
for m in grok-4.3 deepseek-v4-flash glm-5-turbo kimi-k2.6 MiniMax-M3; do
  printf "%s -> " "$m"
  curl -s --max-time 40 https://api.gptsapi.net/v1/chat/completions -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":16}" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("OK" if d.get("choices") else "ERR "+json.dumps(d.get("error",d))[:80])'
done
```
Expected: all 5 print `OK`.

- [ ] **Step 5: Commit**

```bash
git add graupel.yaml.example
git commit -m "feat(models): add xAI/DeepSeek/GLM/Kimi/MiniMax gptsapi endpoints, prune stale Gemini ids"
```
(`librechat.yaml` is gitignored — not committed, but keep it in sync for verification.)

---

## Task 2: modelSpecs curation — enforce-locked grouped cards + verify

**Files:** Modify `graupel.yaml.example`, `librechat.yaml`.

**Interfaces — Consumes:** the 8 endpoints from Task 1.

- [ ] **Step 1: Add the `modelSpecs` block** — top-level in both yaml files. `enforce: true`, `prioritize: true`, and one `list` entry per row of spec §4. Entry template (repeat per card, filling label/group/endpoint/model from the §4 table verbatim; `default: true` ONLY on the gemini-2.5-flash entry):

```yaml
modelSpecs:
  enforce: true
  prioritize: true
  list:
    # ---- Gemini (default) ----
    - name: 'gemini-2.5-flash'
      label: 'Gemini 2.5 Flash'
      default: true
      group: 'Gemini'
      iconURL: 'google'
      description: 'Fast & efficient'
      preset: { endpoint: 'Google', model: 'gemini-2.5-flash' }
    - name: 'gemini-3.1-pro-preview'
      label: 'Gemini 3.1 Pro'
      group: 'Gemini'
      iconURL: 'google'
      preset: { endpoint: 'Google', model: 'gemini-3.1-pro-preview' }
    - name: 'gemini-3-flash-preview'
      label: 'Gemini 3 Flash'
      group: 'Gemini'
      iconURL: 'google'
      preset: { endpoint: 'Google', model: 'gemini-3-flash-preview' }
    - name: 'gemini-2.5-flash-lite'
      label: 'Gemini 2.5 Flash Lite'
      group: 'Gemini'
      iconURL: 'google'
      preset: { endpoint: 'Google', model: 'gemini-2.5-flash-lite' }
    # ---- OpenAI ----
    - name: 'gpt-5.5'
      label: 'GPT-5.5'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.5' }
    - name: 'gpt-5.4'
      label: 'GPT-5.4'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.4' }
    - name: 'gpt-5.4-pro'
      label: 'GPT-5.4 Pro'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.4-pro' }
    - name: 'gpt-5.4-mini'
      label: 'GPT-5.4 mini'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.4-mini' }
    - name: 'gpt-5.4-nano'
      label: 'GPT-5.4 nano'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.4-nano' }
    # ---- Claude ----
    - name: 'claude-opus-4-8'
      label: 'Claude Opus 4.8'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-opus-4-8' }
    - name: 'claude-opus-4-7'
      label: 'Claude Opus 4.7'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-opus-4-7' }
    - name: 'claude-opus-4-6'
      label: 'Claude Opus 4.6'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-opus-4-6' }
    - name: 'claude-opus-4-5'
      label: 'Claude Opus 4.5'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-opus-4-5-20251101' }
    - name: 'claude-sonnet-4-6'
      label: 'Claude Sonnet 4.6'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-sonnet-4-6' }
    - name: 'claude-sonnet-4-6-thinking'
      label: 'Claude Sonnet 4.6 (Thinking)'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-sonnet-4-6-thinking' }
    - name: 'claude-haiku-4-5'
      label: 'Claude Haiku 4.5'
      group: 'Claude'
      iconURL: 'anthropic'
      preset: { endpoint: 'anthropic', model: 'claude-haiku-4-5-20251001' }
    # ---- Grok ----
    - name: 'grok-4.3'
      label: 'Grok 4.3'
      group: 'Grok'
      iconURL: 'xai'
      preset: { endpoint: 'xAI', model: 'grok-4.3' }
    - name: 'grok-4-1-fast'
      label: 'Grok 4.1 Fast'
      group: 'Grok'
      iconURL: 'xai'
      preset: { endpoint: 'xAI', model: 'grok-4-1-fast-non-reasoning' }
    - name: 'grok-4.20-reasoning'
      label: 'Grok 4.20 (Reasoning)'
      group: 'Grok'
      iconURL: 'xai'
      preset: { endpoint: 'xAI', model: 'grok-4.20-beta-0309-reasoning' }
    - name: 'grok-4.20-fast'
      label: 'Grok 4.20 (Fast)'
      group: 'Grok'
      iconURL: 'xai'
      preset: { endpoint: 'xAI', model: 'grok-4.20-beta-0309-non-reasoning' }
    - name: 'grok-4.20-multi-agent'
      label: 'Grok 4.20 Multi-Agent'
      group: 'Grok'
      iconURL: 'xai'
      preset: { endpoint: 'xAI', model: 'grok-4.20-multi-agent-beta-0309' }
    # ---- DeepSeek ----
    - name: 'deepseek-v4-pro'
      label: 'DeepSeek V4 Pro'
      group: 'DeepSeek'
      iconURL: 'https://api.gptsapi.net/favicon.ico'
      preset: { endpoint: 'DeepSeek', model: 'deepseek-v4-pro' }
    - name: 'deepseek-v4-flash'
      label: 'DeepSeek V4 Flash'
      group: 'DeepSeek'
      iconURL: 'https://api.gptsapi.net/favicon.ico'
      preset: { endpoint: 'DeepSeek', model: 'deepseek-v4-flash' }
    # ---- GLM ----
    - name: 'glm-5.2'
      label: 'GLM-5.2'
      group: 'GLM'
      preset: { endpoint: 'GLM', model: 'glm-5.2' }
    - name: 'glm-5-turbo'
      label: 'GLM-5 Turbo'
      group: 'GLM'
      preset: { endpoint: 'GLM', model: 'glm-5-turbo' }
    # ---- Kimi ----
    - name: 'kimi-k2.6'
      label: 'Kimi K2.6'
      group: 'Kimi'
      preset: { endpoint: 'Kimi', model: 'kimi-k2.6' }
    # ---- MiniMax ----
    - name: 'minimax-m3'
      label: 'MiniMax M3'
      group: 'MiniMax'
      preset: { endpoint: 'MiniMax', model: 'MiniMax-M3' }
```
> `iconURL` notes: `openAI`/`anthropic`/`google`/`xai` are LibreChat built-in icon keys. For DeepSeek/GLM/Kimi/MiniMax there's likely no built-in key — Step 4 verifies how `SpecIcon` renders a missing/string icon and picks the cleanest fallback (a hosted favicon URL like shown for DeepSeek, an emoji-free letter avatar, or omit `iconURL` to use the group/endpoint default). Apply the chosen fallback consistently to those four.

- [ ] **Step 2: Restart backend, verify config valid**

```bash
pkill -f "npm run backend" 2>/dev/null; sleep 2
cd /data/lidongyu/projects/LibreChat
LD_LIBRARY_PATH="$HOME/.local/ssl1.1/usr/lib/x86_64-linux-gnu" nohup npm run backend > /tmp/lc-backend.log 2>&1 &
sleep 25
grep -E "Server readiness checks passing" /tmp/lc-backend.log && echo "CONFIG VALID ✓"
grep -iE "modelSpec|spec.*invalid|error.*config" /tmp/lc-backend.log | head
```
Expected: readiness passing. (modelSpecs is validated by `specsConfigSchema` on boot — a malformed spec fails readiness.)

- [ ] **Step 3: Verify the curated selector in the running app (Playwright)** — frontend dev server on 3090 (restart if needed: `npm run frontend:dev`). Drive the browser:
  1. Log in (`verify@test.com` / `TestPass123!`).
  2. Open the model selector. Assert: **only the 8 curated family groups** appear (OpenAI/Claude/Gemini/Grok/DeepSeek/GLM/Kimi/MiniMax) with the curated labels — NO long raw `model id` lists (enforce). 
  3. Assert the default selected model on a new chat is **Gemini 2.5 Flash**.
  4. Screenshot the open selector as evidence.

- [ ] **Step 4: Icon fallback decision** — from the Step 3 screenshot, inspect how DeepSeek/GLM/Kimi/MiniMax cards render their icon. If broken/ugly, read `client/src/components/Chat/Menus/Endpoints/components/SpecIcon.tsx` to see how it resolves `iconURL` (URL vs known key vs fallback), choose the cleanest option (hosted favicon URL / letter avatar / group icon), update those 4 entries in both yaml files, restart backend, re-screenshot. If acceptable as-is, note it and skip.

- [ ] **Step 5: End-to-end family check** — send one message with one card from EACH family (8 sends), confirming a normal reply. **Must include a Claude card** (verifies the `anthropic` Messages-API path on gptsapi, which differs from the chat-completions path tested in the spec — spec §9 item 5) and at least one of each new custom endpoint (xAI/DeepSeek/GLM/Kimi/MiniMax). Capture pass/fail per family. Any family that errors → fix its endpoint/model id (or drop that card) before completing.

- [ ] **Step 6: Commit**

```bash
git add graupel.yaml.example
git commit -m "feat(models): add use.ai-style curated modelSpecs (8 families, enforce, default Gemini 2.5 Flash)"
```

---

## Self-Review

- **Spec coverage:** §3 endpoints → Task 1. §4 model table (26 cards) → Task 2 Step 1 (every row → one list entry). §5 modelSpecs structure (enforce/prioritize/default) → Task 2 Step 1. §6 two config files → both tasks edit both; graupel.yaml.example committed. §7 frontend native render + minimal-tweak → Task 2 Steps 3-4. §8 no gating → Global Constraints (not wired). §9 verification (incl. enforce, default, anthropic Messages path) → Task 2 Steps 3+5. Icons §5 → Task 2 Step 4.
- **Placeholder scan:** the icon fallback for 4 providers is a real decision deferred to Step 4 (with concrete options + how to decide), not a vague placeholder. The card list is fully enumerated (no "similar to above").
- **Consistency:** spec `name`s are unique; `preset.endpoint` values (`openAI`/`anthropic`/`Google`/`xAI`/`DeepSeek`/`GLM`/`Kimi`/`MiniMax`) exactly match the endpoint `name`s created in Task 1; `model` ids match the vetted §4 list (note `claude-opus-4-5` card → model `claude-opus-4-5-20251101`; `minimax-m3` card → model `MiniMax-M3`; `claude-haiku-4-5` → `claude-haiku-4-5-20251001`).
- **Open risk carried to verification:** Claude via the `anthropic` Messages API (Task 2 Step 5) — if it fails on gptsapi, fall back to routing Claude through an OpenAI-compatible custom `Anthropic` endpoint (gptsapi /v1 chat-completions, which WAS vetted), mirroring the other custom endpoints. Note this as the contingency.
