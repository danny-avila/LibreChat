#!/usr/bin/env python3
"""Apply the #13898 subagent-over-/v1 integration (SUBAGENTS_V1_INTEGRATION.md).

Anchored text edits. Per-file atomic: if ANY anchor is missing in a file, that
file is left untouched and the script exits non-zero with a clear message.
Idempotent: files already containing the 13898 marker are skipped.
"""
import re
import sys
import glob

MARK = "#13898"
ok_msgs, errors = [], []


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def must_find(hay, needle, path, what):
    i = hay.find(needle)
    if i < 0:
        errors.append(f"{path}: anchor NOT FOUND for {what}:\n  {needle[:90]!r}")
    return i


# ---------------------------------------------------------------- 1) package export
def patch_package_export():
    candidates = glob.glob("packages/api/src/**/index.ts", recursive=True)
    target = None
    for p in candidates:
        s = read(p)
        if "./discovery" in s or "agents/discovery" in s:
            target = p
            break
    if not target:
        errors.append("packages/api: no index.ts exporting discovery found — add "
                      "`export * from './subagents';` next to the discovery export manually.")
        return
    s = read(target)
    if "subagents" in s:
        ok_msgs.append(f"{target}: subagents export already present (skip)")
        return
    if "./discovery" in s:
        line = next(l for l in s.splitlines() if "./discovery" in l)
        s = s.replace(line, line + "\n" + line.replace("discovery", "subagents"), 1)
    else:
        line = next(l for l in s.splitlines() if "agents/discovery" in l)
        s = s.replace(line, line + "\n" + line.replace("discovery", "subagents"), 1)
    write(target, s)
    ok_msgs.append(f"{target}: added subagents export")


# ---------------------------------------------------------------- 2) initialize.js
INIT = "api/server/services/Endpoints/agents/initialize.js"
FACTORY_JWT = """  const { resolveSubagentTrees } = createSubagentLoader({
    primaryConfig,
    skippedAgentIds,
    edgeAgentIds,
    pureSubagentIds,
    subagentGraphIds,
    loadedSubagentConfigIds,
    maxResolvedDepthByConfigId,
    loadAgentById,
    assertSubagentGraphRoom,
    maxSubagentDepth: MAX_SUBAGENT_DEPTH,
    /** #13898 JWT/browser path: no load-time ACL (unchanged; SDK spawn-time callback governs) */
    checkSubagentAccess: undefined,
  });

"""


def patch_initialize():
    s = read(INIT)
    if "createSubagentLoader" in s:
        ok_msgs.append(f"{INIT}: already patched (skip)")
        return
    a = must_find(s, "  discoverConnectedAgents,", INIT, "require block")
    b = must_find(s, "  const loadSubagentsFor = async (config, depth = 0) => {", INIT, "closure start")
    c = must_find(s, "  const maxResolvedDepthByConfigId = new Map();", INIT, "Map decl")
    d = must_find(s, "  const resolveSubagentTrees = async (rootConfigs) => {", INIT, "resolve closure")
    e = must_find(s, "  await resolveSubagentTrees([primaryConfig, ...agentConfigs.values()]);", INIT, "call site")
    if min(a, b, c, d, e) < 0:
        return
    # order matters: edit from the end of the file backwards
    s = s[:d] + FACTORY_JWT + s[e:]                    # closure2 -> factory (call site kept)
    s = s[:b] + s[c:]                                   # delete closure1, keep Map decl
    s = s.replace("  discoverConnectedAgents,",
                  "  discoverConnectedAgents,\n  createSubagentLoader,", 1)
    write(INIT, s)
    ok_msgs.append(f"{INIT}: closures -> createSubagentLoader (JWT path, allow-all)")


# ---------------------------------------------------------------- 3) controllers
V1_BLOCK = """
    /**
     * #13898: load subagent-spawn configs for the /v1 path (parity with handoffs,
     * mirrors PR #12740). Placement/state is local; ACL = REMOTE_AGENT + VIEW,
     * the same boundary discoverConnectedAgents enforces for handoff targets.
     */
    const subagentsCapabilityEnabled = enabledCapabilities.has(AgentCapabilities.subagents);
    if (subagentsCapabilityEnabled) {
      const subagentSkippedIds = new Set();
      const subagentGraphIds = new Set([primaryConfig.id, ...handoffAgentConfigs.keys()]);
      const loadSubagentConfigById = async (agentId) => {
        const agent = await db.getAgent({ id: agentId });
        if (!agent) {
          subagentSkippedIds.add(agentId);
          return null;
        }
        return initializeAgent(
          {
            req,
            res,
            agent,
            loadTools,
            requestFiles: [],
            conversationId,
            parentMessageId,
            endpointOption,
            allowedProviders,
          },
          dbMethods,
        );
      };
      const assertSubagentGraphRoom = (agentId) => {
        if (subagentGraphIds.size >= MAX_SUBAGENT_GRAPH_NODES) {
          throw new Error(
            `Subagent graph exceeds the maximum of ${MAX_SUBAGENT_GRAPH_NODES} agents at ${agentId}.`,
          );
        }
      };
      const checkSubagentPermission = async ({ userId, role, resourceId, requiredPermission }) => {
        const permissions = await getRemoteAgentPermissions(
          { getEffectivePermissions },
          userId,
          role,
          resourceId,
        );
        return hasPermissions(permissions, requiredPermission);
      };
      const { resolveSubagentTrees } = createSubagentLoader({
        primaryConfig,
        skippedAgentIds: subagentSkippedIds,
        edgeAgentIds: new Set([primaryConfig.id, ...handoffAgentConfigs.keys()]),
        pureSubagentIds: new Set(),
        subagentGraphIds,
        loadedSubagentConfigIds: new Set(),
        maxResolvedDepthByConfigId: new Map(),
        loadAgentById: loadSubagentConfigById,
        assertSubagentGraphRoom,
        maxSubagentDepth: MAX_SUBAGENT_DEPTH,
        getAgent: db.getAgent,
        checkSubagentAccess: buildRemoteAgentSubagentAccessCheck(req, checkSubagentPermission),
      });
      await resolveSubagentTrees([primaryConfig, ...handoffAgentConfigs.values()]);
    }
"""


def patch_controller(path):
    s = read(path)
    if "createSubagentLoader" in s:
        ok_msgs.append(f"{path}: already patched (skip)")
        return
    a = must_find(s, "  getRemoteAgentPermissions,", path, "@librechat/api require")
    anchor = "primaryConfig.edges = discoveredEdges;"
    b = must_find(s, anchor, path, "insertion point")
    m = re.search(r"(const\s*\{)([^}]*)\}\s*=\s*require\('librechat-data-provider'\)", s)
    if not m:
        errors.append(f"{path}: librechat-data-provider require not found for MAX_SUBAGENT_* import")
    if min(a, b) < 0 or not m:
        return
    if "MAX_SUBAGENT_GRAPH_NODES" not in m.group(2):
        s = s[:m.start(2)] + " MAX_SUBAGENT_DEPTH, MAX_SUBAGENT_GRAPH_NODES," + s[m.start(2):]
    s = s.replace("  getRemoteAgentPermissions,",
                  "  getRemoteAgentPermissions,\n  createSubagentLoader,\n  buildRemoteAgentSubagentAccessCheck,", 1)
    i = s.find(anchor)  # re-find after edits
    j = i + len(anchor)
    s = s[:j] + "\n" + V1_BLOCK + s[j:]
    write(path, s)
    ok_msgs.append(f"{path}: /v1 subagent block inserted (REMOTE_AGENT+VIEW)")


patch_package_export()
patch_initialize()
patch_controller("api/server/controllers/agents/openai.js")
patch_controller("api/server/controllers/agents/responses.js")

print("\n".join(ok_msgs))
if errors:
    print("\n=== FAILED (files with errors were NOT modified) ===")
    print("\n".join(errors))
    sys.exit(1)
print("\nAll #13898 edits applied. Next: docker build (see SUBAGENTS_V1_INTEGRATION.md §5).")
