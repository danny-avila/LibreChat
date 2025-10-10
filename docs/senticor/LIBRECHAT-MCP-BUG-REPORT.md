# LibreChat MCP Bug Report: Entity Field Not Passed to MCP Server

**Status:** Critical Bug
**Affects:** LibreChat Agents with MCP Tools
**Version:** LibreChat v0.8.0
**Date:** 2025-10-10

---

## **Summary**

When LibreChat Agents call MCP tools with complex arguments (like `add_entity_to_honeycomb`), the **`entity` field is completely stripped out** before being sent to the MCP server, even though the Agent UI shows it was included.

---

## **Evidence**

### **What the Agent Shows:**
```
Agent hat diese Information an honeycomb gesendet
{
  "entity": {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Sozialministerium Baden-Württemberg"
  },
  "honeycombId": "hc_integrationsbericht_bw_2025",
  "source": {...}
}
```

### **What the MCP Server Actually Receives:**
```bash
[MCP DEBUG] args keys: [ 'honeycombId', 'source' ]
[MCP DEBUG] entity exists? false undefined
```

**The `entity` field is completely missing!**

---

## **Impact**

- ❌ **All MCP tools requiring complex object arguments fail**
- ❌ **Knowledge graph operations unusable**
- ❌ **Agent shows misleading "data sent" but it's not transmitted**
- ❌ **No error message to user explaining why it failed**

---

## **Reproduction Steps**

1. Install LibreChat v0.8.0 with MCP server (e.g., senticor-hive-mcp)
2. Configure Agent with Gemini 2.5 Pro or 2.5 Flash
3. Create honeycomb (works fine)
4. Try to add entity with schema.org JSON-LD:
   ```
   {
     "honeycombId": "hc_test",
     "entity": {
       "@context": "https://schema.org",
       "@type": "Organization",
       "name": "Test Org"
     }
   }
   ```
5. **Result:** API returns 422 "entity field required"
6. **MCP Debug Logs:** Show `entity` is missing from args

---

## **Root Cause (Suspected)**

LibreChat appears to be **serializing/filtering MCP tool arguments** before passing them to the MCP server, and complex nested objects (like `entity`) are being stripped out.

Possible locations:
- `api/server/services/MCP.js` or `MCPManager.ts`
- Tool argument serialization in Agents endpoint
- JSON serialization losing nested objects

---

## **Workaround**

For demo purposes, bypass LibreChat and call HIVE API directly:
```bash
curl -X POST "http://localhost:8000/api/honeycombs/{id}/entities" \
  -H "Content-Type: application/json" \
  -d '{"entity": {...}, "source": {...}, "provenance": {...}}'
```

See: `/docs/senticor/populate-integrationsbericht.sh`

---

## **Expected Behavior**

MCP server should receive **ALL** arguments that the Agent claims to send, including complex nested objects like `entity`.

---

## **Testing Environment**

- **LibreChat:** v0.8.0 (ghcr.io/danny-avila/librechat-dev:latest)
- **Container:** Podman
- **Models Tested:** Gemini 2.5 Pro, Gemini 2.5 Flash
- **MCP Server:** senticor-hive-mcp v0.2.0
- **HIVE API:** v1.0.0 (FastAPI)

---

## **Related Issues**

- This may affect **ALL MCP servers** requiring complex arguments
- Not specific to Gemini models
- Not a model tool-calling issue (model generates correct args)
- LibreChat-specific argument stripping

---

## **Suggested Fix**

1. Review MCP tool argument serialization in LibreChat
2. Ensure nested objects are preserved when passing to MCP server
3. Add validation to warn when arguments are modified/stripped
4. Better error messages when MCP calls fail

---

## **Files to Check**

- `api/server/services/Tools/mcp.js`
- `packages/api/src/mcp/MCPManager.ts`
- `api/server/controllers/agents.js`

---

**Report filed by:** Senticor Demo Team
**Contact:** via GitHub Issues
**Priority:** High (blocks production use of MCP with Agents)
