# Quick Fix: "Entity field is required" Error

**Problem:** Agent fails with error:
```
❌ Error in add_entity_to_honeycomb: Entity field is required but was not provided by LibreChat
```

## Root Cause

LibreChat has a bug where nested object parameters in MCP tool calls are not passed to the MCP server correctly. The `entity` object gets stripped out before reaching the HIVE MCP server.

**Full details:** [LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md](./LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md)

## Immediate Solution

✅ **Use `batch_add_entities` instead of `add_entity_to_honeycomb`**

The batch operation works correctly because it has a different parameter structure that avoids the bug.

## How to Fix Your Current Conversation

Tell the agent:

```
Please use batch_add_entities instead of add_entity_to_honeycomb.

Add all 34 projects in a single batch_add_entities call.

Example format:
batch_add_entities({
  honeycombId: "hc_bericht_integration_baden_wuerttemberg_2025",
  entities: [
    {
      entity: {
        "@context": "https://schema.org",
        "@type": "Project",
        "name": "Integration Plus Stuttgart",
        "description": "Integration program in Stuttgart...",
        "organizer": "Stadt Stuttgart"
      },
      source: {
        "document_name": "Pressemitteilung Land fördert 34 lokale Integrationsprojekte",
        "source_url": "https://sozialministerium.baden-wuerttemberg.de/..."
      }
    },
    {
      entity: {
        "@context": "https://schema.org",
        "@type": "Project",
        "name": "Second project...",
        ...
      },
      source: {...}
    }
    // ... all 34 projects
  ]
})
```

## What Changed

I've already updated [librechat.yaml](../../librechat.yaml) to instruct agents to prefer `batch_add_entities`:

- ✅ **batch_add_entities** - PREFERRED, works correctly
- ❌ **add_entity_to_honeycomb** - AVOID, has LibreChat bug

## Why This Works

- `batch_add_entities` nests objects inside array elements
- `add_entity_to_honeycomb` nests objects directly as parameters
- LibreChat's bug affects direct nesting, not array nesting

## Benefits

Using batch operations is actually **better anyway**:

- 🚀 **20-30x faster** than 34 sequential calls
- 🔒 **Atomic** - all entities added or none (transaction)
- 📊 **Cleaner** - one tool call instead of 34

## Next Conversation

For new conversations, the agent will automatically use `batch_add_entities` because of the updated instructions in librechat.yaml. You won't need to tell it.

## Files Modified

- ✅ [librechat.yaml](../../librechat.yaml) - Updated server instructions (lines 347-388)
- ✅ [LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md](./LIBRECHAT-MCP-BUG-NESTED-OBJECTS.md) - Full bug report
- ✅ [QUICK-FIX-ENTITY-ERROR.md](./QUICK-FIX-ENTITY-ERROR.md) - This document

## Test After Fix

After the agent adds entities with `batch_add_entities`, verify:

```
Show me statistics for the honeycomb
```

Should show all 34+ entities added successfully.

---

**TL;DR:** Tell the agent to use `batch_add_entities` instead of `add_entity_to_honeycomb`. This works around a LibreChat bug and is faster anyway.
