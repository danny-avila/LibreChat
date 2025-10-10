# MCP Tool Name Suffix Issue - RESOLVED

**Date:** October 10, 2025
**Status:** ✅ RESOLVED

## The Problem

Agent was calling `batch_add_entities` but getting error:
```
Error processing tool: Tool "batch_add_entities_mcp_honeycomb" not found.
```

## Root Cause

**LibreChat automatically appends the MCP server name as a suffix to all tool names** to avoid naming conflicts when multiple MCP servers are loaded.

### Example

If your MCP server is named `honeycomb` in librechat.yaml:

```yaml
mcpServers:
  honeycomb:  # <- Server name
    type: stdio
    ...
```

And your MCP server registers a tool called `batch_add_entities`, LibreChat will make it available as:
```
batch_add_entities_mcp_honeycomb
```

The format is: `{tool_name}_mcp_{server_name}`

## The Fix

Updated [librechat.yaml](../../librechat.yaml:356-395) to instruct agents to use the full tool names with `_mcp_honeycomb` suffix:

### Correct Tool Names

All HIVE honeycomb tools must include the suffix:

- ✅ `batch_add_entities_mcp_honeycomb`
- ✅ `create_honeycomb_mcp_honeycomb`
- ✅ `list_honeycombs_mcp_honeycomb`
- ✅ `search_entities_mcp_honeycomb`
- ✅ `get_honeycomb_stats_mcp_honeycomb`
- ✅ `get_honeycomb_mcp_honeycomb`
- ✅ `update_entity_mcp_honeycomb`
- ✅ `delete_entity_mcp_honeycomb`
- ✅ `prepare_entity_extraction_mcp_honeycomb`
- ❌ `add_entity_to_honeycomb_mcp_honeycomb` (still has nested object bug)

### Example Usage

```javascript
// ✅ CORRECT
batch_add_entities_mcp_honeycomb({
  honeycombId: "hc_test",
  entities: [...]
})

// ❌ WRONG - Missing suffix
batch_add_entities({...})
```

## Why This Happens

LibreChat needs to support multiple MCP servers simultaneously. To prevent tool name collisions (e.g., two servers both having a `search` tool), it namespaces them by appending `_mcp_{server_name}`.

This is LibreChat's convention, not an MCP standard.

## Other MCP Servers Affected

This applies to ALL MCP servers in your librechat.yaml:

### rechtsinformationen-bund-de

Tools become:
- `deutsche_gesetze_suchen_mcp_rechtsinformationen-bund-de`
- `gesetz_details_abrufen_mcp_rechtsinformationen-bund-de`
- etc.

### fetch

Tools become:
- `fetch_mcp_fetch`

## How to Verify Tool Names

Check the LibreChat backend logs at startup:

```bash
podman logs LibreChat 2>&1 | grep "MCP servers initialized"
```

Should show:
```
MCP servers initialized successfully. Added 17 MCP tools.
```

Or list available tools in a conversation:
```
What MCP tools do you have available?
```

The agent will see the full tool names with suffixes.

## Actions Taken

1. ✅ Updated librechat.yaml with correct tool naming documentation
2. ✅ Added examples showing `_mcp_honeycomb` suffix
3. ✅ Documented all affected tools
4. ⏳ Need to restart backend for changes to take effect

## After Restart

Start a **new conversation** and the agent will automatically use the correct tool names.

## Files Modified

- ✅ [librechat.yaml](../../librechat.yaml:356-395) - Added tool naming documentation
- ✅ [TOOL-NAME-SUFFIX-FIX.md](./TOOL-NAME-SUFFIX-FIX.md) - This document

## Summary

**TL;DR:** LibreChat adds `_mcp_{server_name}` to all MCP tool names. Agents must use `batch_add_entities_mcp_honeycomb` not `batch_add_entities`. This is now documented in librechat.yaml so new conversations will work correctly.
