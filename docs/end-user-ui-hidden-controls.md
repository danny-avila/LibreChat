# End-user UI — hidden controls (maintainer reference)

AI Workforce Pro hides advanced and provider-facing controls so end users get a simplified chat experience. Prefer **`librechat.yaml` `interface` flags**; use client changes only when no flag exists.

**Primary config:** `librechat.yaml` (mirror in `librechat.example.yaml`)

**After changing permission-related flags** (`prompts.*`, `agents.*`, `multiConvo`, etc.), restart the backend so role permissions sync on startup.

---

## What is hidden and how

| UI element | User-facing location | Mechanism | Config / code |
| --- | --- | --- | --- |
| **Preset selector** | Chat header | Yaml flag | `interface.presets: false` — gated in `client/src/components/Chat/Header.tsx` (`presets && modelSelect`) |
| **Model / endpoint dropdown** | Chat header | Yaml flag | `interface.modelSelect: false` — `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx` |
| **Parameters gear & popover** (system prompt, temperature, save-as-preset, etc.) | Chat input header | Yaml flag | `interface.parameters: false` — `client/src/components/Chat/Input/HeaderOptions.tsx` |
| **Parameters side panel** | Right side panel | Yaml flag | `interface.parameters: false` — `client/src/hooks/Nav/useSideNavLinks.ts` |
| **Multi-conversation (+) button** | Chat header | Yaml flag → permissions | `interface.multiConvo: false` — synced via `packages/api/src/app/permissions.ts`; UI in `client/src/components/Chat/Header.tsx` |
| **Prompt library “Create”** | Prompts UI | Yaml flag → permissions | `interface.prompts.create: false` — e.g. `client/src/components/Prompts/buttons/CreatePromptButton.tsx` |
| **Agent builder side panel** | Right side panel | Yaml flag → permissions | `interface.agents.use: false` and `interface.agents.create: false` — `client/src/hooks/Nav/useSideNavLinks.ts` |
| **Conversation fork** | Message hover actions | Yaml flag (custom) | `interface.forking: false` — `client/src/components/Chat/Messages/HoverButtons.tsx` → `client/src/hooks/useGenerationsByLatest.ts` |
| **Fork default settings** | Settings → Chat | Yaml flag (custom) | `interface.forking: false` — `client/src/components/Nav/SettingsTabs/Chat/Chat.tsx` |
| **Branch message** (parallel response split) | Parallel message headers | Yaml flag (custom) | `interface.forking: false` — `client/src/components/Chat/Messages/Content/SiblingHeader.tsx` |
| **Advanced prompts editor mode** | Settings → Chat | Yaml + permissions | Hidden when `interface.parameters: false` or `interface.prompts.create: false` — `client/src/components/Nav/SettingsTabs/Chat/Chat.tsx` |

---

## Current `interface` block (AI Workforce Pro)

```yaml
interface:
  modelSelect: false
  parameters: false
  presets: false
  forking: false
  multiConvo: false
  prompts:
    use: true
    create: false
    share: false
    public: false
  agents:
    use: false
    create: false
    share: false
    public: false
```

Related deployment settings (not under `interface`):

- **`ENDPOINTS=anthropic`** (`.env`) — only the Claude built-in endpoint is enabled.
- **`modelSpecs`** in yaml — default assistant preset (`claude-sonnet-4-6`) when model select is off.

---

## Custom flag: `interface.forking`

Forking had no upstream LibreChat flag. **`interface.forking`** was added in:

- `packages/data-provider/src/config.ts` (schema; default `true` for backward compatibility)

Rebuild after schema changes:

```bash
npm run build:data-provider
```

---

## White-label / provider branding

Provider logos and names in the chat UI are neutralized in `client/src/utils/branding.ts` and related icon/sender components. See that module when adding new surfaces that show endpoint or model identity.

---

## Re-enabling a control

1. Set the relevant `interface.*` flag to `true` in `librechat.yaml`.
2. Restart the backend (required for permission-backed flags).
3. Rebuild `data-provider` only if you changed `packages/data-provider`.
4. Refresh the frontend (or restart `npm run frontend:dev`).

For agent builder when the agents endpoint is enabled later, you can also set `endpoints.agents.disableBuilder: true` in yaml as an endpoint-level override.
