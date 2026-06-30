# MCP Tools in the `$` Skills Command — Implementation Plan

**Status:** In progress (Phase 1 — discovery UI)  
**Feature branch:** `feat/mcp-skills-command`  
**Last updated:** 2026-06-29

---

## Problem

The `$` command popover (`SkillsCommand.tsx`) only lists **LibreChat Skills** (`SKILL.md` documents from MongoDB via `useSkillsInfiniteQuery`). It does **not** list MCP tools.

In AI Workforce Pro, most user-facing capabilities live on MCP servers (especially `smbteam-mcp`, plus `filesystem` and `excel` from `librechat.yaml`). Those tools already load at runtime through `loadEphemeralAgent` and work when the model picks them from natural language, but the UI shows **"No skills yet"** because the Skills API returns no matching documents.

| System | Data source | Discovery today |
|--------|-------------|-----------------|
| **Skills** | MongoDB `/api/skills` | `$` popover, Skills sidebar |
| **MCP tools** | `GET /api/mcp/tools` | Tools menu → MCP servers (on/off only), not per-tool list |

---

## Goals

### Phase 1 (this branch) — Discovery

- User types `$` and sees **both** Skills and **MCP tools** in one searchable list.
- MCP entries show tool name, description, and server label.
- Scope matches backend `loadEphemeralAgent` (global config + model spec + ephemeral toggles).
- Selecting an MCP tool inserts a short natural-language hint in the textarea (Phase 1 — no backend priming).

### Phase 2 (future) — Invocation hints

- Optional `manualToolHints` payload or stronger server priming on select.
- Auto-enable MCP server in `ephemeralAgent.mcp` when user picks a tool from a disabled server.

### Out of scope

- Importing MCP catalog into MongoDB Skills.
- Renaming `$` to a different command character.

---

## Architecture

```
User types '$'
    → useHandleKeyUp opens SkillsCommand popover
    → useSkillsInfiniteQuery  → SKILL.md skills (existing)
    → useMCPToolsQuery      → GET /api/mcp/tools (new in popover)
    → resolveScopedMcpServerNames() filters servers (mirrors loadEphemeralAgent)
    → buildMcpToolMentionOptions() → MentionOption[] type: 'mcp-tool'
    → merged list → useCombobox search
    → on select:
        - skill  → pendingManualSkills + ephemeralAgent.skills (unchanged)
        - mcp-tool → insertTextAtCursor hint + ensure server in ephemeralAgent.mcp
```

**Backend reference:** `packages/api/src/agents/load.ts` — MCP server union logic.

**Existing API:** `api/server/controllers/mcp.js` → `getMCPTools` returns `{ servers: { [name]: { tools: [{ name, pluginKey, description }] } } } }`.

---

## Repository layout (Phase 1)

| Path | Purpose |
|------|---------|
| `client/src/utils/mcpToolsForPopover.ts` | Scope resolution + MCP → `MentionOption` mapping |
| `client/src/utils/__tests__/mcpToolsForPopover.test.ts` | Unit tests for scoping and flattening |
| `client/src/components/Chat/Input/SkillsCommand.tsx` | Merge MCP tools into popover |
| `client/src/locales/en/translation.json` | Section labels, empty states, hint prefix |
| `docs/MCP_SKILLS_COMMAND.md` | This document |

---

## Scoping rules (`resolveMcpServersForSkillsPopover`)

The `$` popover lists MCP tools from **skill-catalog servers only**, not every MCP wired into the agent at runtime.

1. **Global skill catalogs** — keys from `GET /api/mcp/servers` (`useMCPServersQuery`) that are **not** listed in the active modelSpec's `mcpServers` array.
2. **Infrastructure exclusion** — modelSpec `mcpServers` entries (e.g. `filesystem`, `excel`) are agent infrastructure for document generation; their tools are hidden from `$`.
3. **Ephemeral toggles** — non-infrastructure servers from `ephemeralAgent.mcp` are included when the user enables them in the Tools menu.

Example (AIWP): global `{ filesystem, excel, smbteam-mcp }` + modelSpec `[filesystem, excel]` → popover shows **only** `smbteam-mcp` tools (`intake_qualifier`, `lead_follow_up`, …).

Runtime agent loading still uses the full union in `loadEphemeralAgent`; only the discovery UI is narrowed.

---

## Selection behavior (Phase 1)

| Type | Action |
|------|--------|
| `skill` | Push name to `pendingManualSkillsByConvoId`; set `ephemeralAgent.skills = true` (unchanged). |
| `mcp-tool` | Remove trailing `$`; insert `Use "<toolName>" to ` at cursor; add server to `ephemeralAgent.mcp` if missing. |

No server-side changes in Phase 1.

---

## Empty states

| Condition | Message key |
|-----------|-------------|
| No search, no skills, no MCP tools | `com_ui_capabilities_empty` |
| No search, no skills, MCP tools exist | List shows MCP tools (no empty panel) |
| Search with no matches | `com_ui_no_capabilities_found` |
| MCP tools loading | Spinner (existing pattern) |
| MCP tools error | `com_ui_mcp_tools_load_error` |

---

## Testing

### Unit

- `mcpToolsForPopover.test.ts` — scoping union, server filter, sort order, pluginKey parsing.

### Component (follow-up)

- Extend `SkillsCommand.spec.tsx` with mocked `useMCPToolsQuery`.

### Manual QA

1. New chat with AIWP model spec (tools + MCP servers enabled).
2. Type `$` — expect `smbteam-mcp` tools listed.
3. Search partial tool name.
4. Select tool — hint text in textarea, server enabled.
5. User with zero Skills in DB still sees MCP tools.

---

## Implementation checklist

- [x] Feature branch `feat/mcp-skills-command`
- [x] This document
- [ ] `mcpToolsForPopover.ts` + tests
- [ ] `SkillsCommand.tsx` integration
- [ ] i18n strings
- [ ] `SkillsCommand.spec.tsx` MCP cases
- [ ] Manual QA on dev stack

---

## Effort estimate

| Phase | Estimate |
|-------|----------|
| Phase 1 (discovery UI) | 2–3 dev days |
| Phase 2 (backend hints) | 3–5 dev days |
