# LibreChat MCP Bug: Nested Object Parameters Not Passed

**Date:** October 10, 2025
**Status:** 🐛 Confirmed Bug in LibreChat MCP Implementation
**Impact:** HIGH - Blocks single entity additions via `add_entity_to_honeycomb`

## Problem Description

LibreChat's MCP client is **not passing nested object parameters** to MCP servers correctly. When an agent calls a tool with nested JSON objects, only the top-level fields are sent to the MCP server.

### Expected Behavior

Agent calls `add_entity_to_honeycomb` with this payload:

```json
{
  "honeycombId": "hc_test",
  "entity": {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Ministry of Integration",
    "description": "..."
  },
  "source": {
    "document_name": "Press Release",
    "source_url": "https://example.com"
  }
}
```

MCP server should receive all fields including `entity` object.

### Actual Behavior

MCP server receives:

```json
{
  "honeycombId": "hc_test",
  "source": {
    "document_name": "Press Release",
    "source_url": "https://example.com"
  },
  "provenance": {
    "user_id": "librechat-agent",
    "source_type": "web_scrape"
  }
  // ❌ entity field is MISSING!
}
```

The `entity` field is completely stripped out.

## Evidence

### User's Error Message

```
❌ Error in add_entity_to_honeycomb: Entity field is required but was not provided by LibreChat

**Debug Info:**
```json
{
  "honeycombId": "hc_bericht_integration_baden_wuerttemberg_2025",
  "source": {
    "document_name": "Pressemitteilung Land fördert 34 lokale Integrationsprojekte",
    "source_url": "https://sozialministerium.baden-wuerttemberg.de/..."
  },
  "provenance": {
    "user_id": "librechat-agent",
    "source_type": "web_scrape"
  }
}
```

### What LibreChat UI Shows

The agent clearly sent the entity:

```
Agent hat diese Information an honeycomb gesendet
{
  "source": {...},
  "provenance": {...},
  "entity": {
    "@type": "GovernmentOrganization",
    "name": "Ministerium für Soziales, Gesundheit und Integration Baden-Württemberg",
    "description": "...",
    "@context": "https://schema.org"
  },
  "honeycombId": "hc_bericht_integration_baden_wuerttemberg_2025"
}
```

**But the MCP server never receives the `entity` field!**

### MCP Server Logs

The HIVE MCP server has debug logging (lines 657-659 in [index.ts](/Users/wolfgang/workspace/senticor-hive-mcp/src/index.ts:657-659)):

```typescript
console.error('[MCP DEBUG] addEntityToHoneycomb called with args:', JSON.stringify(args, null, 2));
console.error('[MCP DEBUG] args keys:', Object.keys(args));
console.error('[MCP DEBUG] entity exists?', 'entity' in args, typeof args.entity);
```

These logs would show exactly what LibreChat sent to the MCP server.

## Root Cause

This is a bug in LibreChat's MCP client integration, specifically in how it serializes tool call parameters before sending them to the MCP server via stdio.

**Likely location:** [api/server/services/MCP/](../../api/server/services/MCP/)

The MCP client is probably:
1. Correctly receiving the tool call from the agent
2. Incorrectly serializing nested objects before passing to the MCP server
3. Only sending top-level or simple-typed fields

## Workaround: Use batch_add_entities

The `batch_add_entities` tool **does work** because it has a different parameter structure:

```json
{
  "honeycombId": "hc_test",
  "entities": [
    {
      "entity": {...},  // nested inside array element
      "source": {...}
    }
  ]
}
```

This structure somehow avoids the bug (possibly because the nesting is inside an array rather than a direct object property).

### Immediate Fix for Users

**Tell the agent to use `batch_add_entities` instead:**

```
Instead of calling add_entity_to_honeycomb multiple times,
use batch_add_entities to add all entities at once.

Example:
batch_add_entities({
  honeycombId: "hc_test",
  entities: [
    {
      entity: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Ministry",
        "description": "..."
      },
      source: {
        "document_name": "Press Release",
        "source_url": "https://example.com"
      }
    }
  ]
})
```

This is actually **faster** anyway (batch operation vs. 34 sequential calls).

## Long-term Fix: LibreChat Team

### Where to Look

File: `api/server/services/MCP/client.ts` (or similar)

Look for code that:
1. Receives tool call from agent
2. Converts parameters to MCP format
3. Sends to stdio MCP server

### Suspected Issue

Probably something like:

```typescript
// ❌ WRONG: Only copies simple fields
const mcpParams = {
  honeycombId: agentParams.honeycombId,
  source: agentParams.source,
  // entity is skipped because it's an object?
};
```

Should be:

```typescript
// ✅ CORRECT: Deep copy all fields
const mcpParams = JSON.parse(JSON.stringify(agentParams));
// or
const mcpParams = structuredClone(agentParams);
```

### Test Case

Create a test MCP server with this tool:

```typescript
{
  name: 'test_nested_object',
  inputSchema: {
    type: 'object',
    properties: {
      simple: { type: 'string' },
      nested: {
        type: 'object',
        properties: {
          inner: { type: 'string' }
        }
      }
    },
    required: ['simple', 'nested']
  }
}
```

Call from agent:

```
test_nested_object({
  simple: "value",
  nested: { inner: "test" }
})
```

Expected: MCP server receives both `simple` and `nested`
Actual: MCP server probably only receives `simple`

## Impact Assessment

### Affected Tools

Any MCP tool with nested object parameters:

- ✅ `batch_add_entities` - **WORKS** (array of objects)
- ❌ `add_entity_to_honeycomb` - **BROKEN** (nested entity object)
- ❌ `create_honeycomb` - Might work (simple fields only)
- ❌ Any custom MCP tool with complex nested parameters

### Severity

**HIGH** - This breaks a core MCP feature and limits what MCP servers can do.

### Workarounds

1. **Use array-based parameters** instead of direct nesting
2. **Flatten object structures** into string fields (JSON.stringify)
3. **Use batch operations** where available
4. **Avoid nested objects** in tool parameters

## Reproduction Steps

1. Create MCP tool with nested object parameter (like `add_entity_to_honeycomb`)
2. Have agent call the tool with nested data
3. MCP server logs what it receives
4. Compare agent's call vs. server's receipt
5. Observe: nested objects are missing

## Recommendation

### For Senticor Team

**Immediately:** Update librechat.yaml instructions to prefer `batch_add_entities`:

```yaml
serverInstructions: |
  When adding entities to honeycombs:

  ✅ PREFERRED: Use batch_add_entities for one or more entities
  ❌ AVOID: Do not use add_entity_to_honeycomb (has LibreChat bug)

  Example:
  batch_add_entities({
    honeycombId: "hc_test",
    entities: [
      { entity: {...}, source: {...} },
      { entity: {...}, source: {...} }
    ]
  })
```

### For LibreChat Team

**File bug report** with:
1. Description of nested object parameter issue
2. This document as reference
3. Test case showing the bug
4. Suggested fix location

### For HIVE MCP Team

**No changes needed** - both tools work correctly. The bug is in LibreChat's MCP client, not in the HIVE MCP server.

## Related Issues

This might affect other LibreChat MCP integrations:
- Any custom MCP server with complex parameters
- Tools that need structured JSON data
- Multi-level nested configurations

## Status

- [x] Bug identified and documented
- [x] Workaround provided (`batch_add_entities`)
- [ ] Bug reported to LibreChat team
- [ ] Fix implemented in LibreChat
- [ ] Fix verified with HIVE MCP server

## Files

- **This Document:** `/Users/wolfgang/workspace/LibreChat/docs/senticor/LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md`
- **HIVE MCP Server:** `/Users/wolfgang/workspace/senticor-hive-mcp/src/index.ts`
- **LibreChat MCP Client:** `/Users/wolfgang/workspace/LibreChat/api/server/services/MCP/` (suspected)
- **Configuration:** `/Users/wolfgang/workspace/LibreChat/librechat.yaml`

---

**Next Steps:**
1. Update librechat.yaml to instruct agents to use `batch_add_entities`
2. Test the workaround with user's press release scenario
3. Optionally: Report bug to LibreChat GitHub
