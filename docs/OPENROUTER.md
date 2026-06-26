# OpenRouter model picker (operator guide)

AI Workforce Pro exposes a curated model picker backed by **OpenRouter**, a single
OpenAI-compatible gateway to OpenAI, Google, and other providers. Users pick from a
short, branded list (OpenAI + Google); the raw OpenRouter catalog stays hidden.

## How it works

- **`endpoints.custom` → `OpenRouter`** in `librechat.yaml` is the gateway
  (`baseURL: https://openrouter.ai/api/v1`, `apiKey: ${OPENROUTER_KEY}`).
- **`modelSpecs`** defines the curated entries. Each spec's `preset.endpoint` is
  `OpenRouter` and its `model` is an OpenRouter slug (e.g. `openai/gpt-5.5-pro`).
- **`modelSpecs.enforce: true`** restricts users to the curated specs and hides the
  raw endpoint catalog in the picker (`ModelSelector.tsx`).
- Shared tool flags (`&aiw_tools`) and the system prompt (`&aiw_instructions`) are
  defined **once** on the first spec via YAML anchors and reused by every spec — so
  every model gets the same integrations (Drive, Gmail, OneDrive, Dropbox, Clio,
  code execution, MCP servers, etc.) without duplication.

## Setup

1. Create a key at [openrouter.ai](https://openrouter.ai/) (Keys page). It starts with `sk-or-v1-`.
2. In `.env` set:

   ```env
   OPENROUTER_KEY=sk-or-v1-your-key-here
   ```

   Use `OPENROUTER_KEY`, **not** `OPENROUTER_API_KEY` — the latter would also reroute
   the built-in OpenAI endpoint through OpenRouter.
3. Restart the backend. The picker appears with the curated models.

## Curated models (default)

| Group  | Label          | OpenRouter slug          |
| ------ | -------------- | ------------------------ |
| OpenAI | GPT-5.5 Pro    | `openai/gpt-5.5-pro`     |
| OpenAI | GPT-5.5        | `openai/gpt-5.5`         |
| OpenAI | o3             | `openai/o3`              |
| Google | Gemini 2.5 Pro | `google/gemini-2.5-pro`  |
| Google | Gemini 2.5 Flash | `google/gemini-2.5-flash` |

`GPT-5.5 Pro` is the default (`default: true`). Verify exact slugs against the live
catalog: `GET https://openrouter.ai/api/v1/models` or [openrouter.ai/models](https://openrouter.ai/models).

## Adding a model

Two small edits in `librechat.yaml`, no code changes:

1. Add the slug to `endpoints.custom` → `OpenRouter` → `models.default`.
2. Add a spec to `modelSpecs.list`, reusing the anchors:

   ```yaml
   - <<: *aiw_tools
     name: my-new-model
     label: My New Model
     description: One-line description shown in the picker.
     group: OpenAI # or Google, or a new group name
     preset:
       endpoint: OpenRouter
       model: provider/my-new-model-slug
       greeting: How can I help you today?
       instructions: *aiw_instructions
   ```

To start a **new group**, set a new `group` value and add `groupIcon` on its first spec
(`openAI`, `google`, a built-in endpoint key, or an image URL).

## Removing a model

Delete its spec from `modelSpecs.list` and its slug from `models.default`. Don't delete
the first spec without moving the `&aiw_tools` / `&aiw_instructions` anchor definitions
to whichever spec becomes first.

## Notes

- `dropParams: ["stop"]` strips the `stop` param — OpenRouter models use varied stop
  tokens and this avoids 400 compatibility errors.
- A `402 Payment Required` comes from OpenRouter (not LibreChat) — add credits or pick a
  free model.
- Tool-enabled specs run as **ephemeral agents** through the agents endpoint using the
  selected OpenRouter model; this is the same mechanism the picker has always used.
- `librechat.example.yaml` is an upstream template and is not kept byte-for-byte in sync
  with this curated block; `librechat.yaml` is the source of truth.
