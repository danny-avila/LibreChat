import { Constants } from '@librechat/agents';
import type { FileRefs, CodeEnvFile, ToolSessionMap, CodeSessionContext } from '@librechat/agents';

/**
 * Minimal shape for an agent that may contribute primed code files to the
 * run-wide sandbox seed. Both `InitializedAgent` and `RunAgent` satisfy it,
 * and the recursive walk in {@link buildInitialToolSessions} traverses
 * `subagentAgentConfigs` so nested subagents (which aren't in the top-level
 * `agentConfigs` map after pure-subagent pruning) still contribute.
 */
export interface CodeFilesAgent {
  primedCodeFiles?: CodeEnvFile[];
  subagentAgentConfigs?: CodeFilesAgent[];
}

/**
 * Merges primed code-execution file references into a `ToolSessionMap` so the
 * Graph's `ToolNode` can inject them into the very first `execute_code` tool
 * call as `_injected_files`. Without this seed, `ToolNode.getCodeSessionContext`
 * has no entry to read on call #1, and the agent-side `CodeExecutor` falls back
 * to a `/files/{session_id}` fetch — but `session_id` itself is only populated
 * after the first call returns one, so primed files were silently dropped.
 *
 * Files from `primeFiles` (api/server/services/Files/Code/process.js) carry
 * per-file `session_id`s. The map's representative `session_id` is taken from
 * the first incoming file (matching `primeInvokedSkills`); per-file ids on the
 * `files` array are what `ToolNode` actually uses (`file.session_id ?? codeSession.session_id`).
 *
 * When an entry already exists (e.g. seeded by `primeInvokedSkills` for skill
 * files), incoming files are appended after the existing ones. The pre-existing
 * representative `session_id` is preserved so a partial-cache/fresh-prime
 * collision doesn't shift which session id `ToolNode` picks for the call.
 */
export function seedCodeFilesIntoSessions(
  files: CodeEnvFile[] | undefined,
  existing: ToolSessionMap | undefined,
): ToolSessionMap | undefined {
  if (!files || files.length === 0) {
    return existing;
  }

  const sessions: ToolSessionMap = existing ?? new Map();
  const prior = sessions.get(Constants.EXECUTE_CODE) as CodeSessionContext | undefined;

  const mergedFiles: FileRefs = prior?.files ? [...prior.files, ...files] : files;
  const representativeSessionId = prior?.session_id ?? files[0].session_id;

  if (!representativeSessionId) {
    return existing;
  }

  sessions.set(Constants.EXECUTE_CODE, {
    session_id: representativeSessionId,
    files: mergedFiles,
    lastUpdated: Date.now(),
  } satisfies CodeSessionContext);

  return sessions;
}

/**
 * Builds the run-wide initial `ToolSessionMap` for `Graph.sessions`,
 * combining skill-priming output with code-resource files primed across
 * every agent that may execute code in this run.
 *
 * **Why "run-wide" (not per-agent):** `Graph.sessions` is a single map
 * shared by every `ToolNode` instance in the run by design — the
 * agents-library treats the code-execution sandbox as a conversation-
 * scoped workspace, not an agent-scoped one. Two agents that both have
 * code-execution enabled (a primary + a handoff target, or a parent +
 * a subagent) implicitly share session_id and file refs through this
 * map. This helper makes that explicit at the seeding boundary: every
 * reachable agent's `primedCodeFiles` flows into the same
 * `EXECUTE_CODE` entry. If per-agent isolation is ever needed, that
 * has to land in the agents library first (per-agent `AgentContext`
 * sessions); changing only this helper would diverge from how the
 * sandbox actually behaves at runtime.
 *
 * **Walk:** primary first, then `agentConfigs` (handoff/addedConvo),
 * then recurse into each config's `subagentAgentConfigs`. The visited
 * set is keyed by object identity (Set<CodeFilesAgent>) so cycles in
 * a malformed agent graph (a subagent that points back at its parent)
 * can't infinite-loop the seed.
 *
 * @param skillSessions - Output of `primeInvokedSkills` — already
 *   contains an `EXECUTE_CODE` entry when skill files were primed; new
 *   files from this walk merge into it (representative `session_id`
 *   from the skill side is preserved).
 * @param agents - The complete set of code-execution-capable agents in
 *   the run. Caller passes `[primaryConfig, ...agentConfigs.values()]`;
 *   this function recurses into each one's `subagentAgentConfigs`.
 */
export function buildInitialToolSessions(params: {
  skillSessions?: ToolSessionMap;
  agents: Iterable<CodeFilesAgent | undefined | null>;
}): ToolSessionMap | undefined {
  const { skillSessions, agents } = params;
  let sessions = skillSessions;
  const visited = new Set<CodeFilesAgent>();
  const stack: CodeFilesAgent[] = [];
  for (const a of agents) {
    if (a) stack.push(a);
  }
  while (stack.length > 0) {
    const agent = stack.pop()!;
    if (visited.has(agent)) continue;
    visited.add(agent);
    if (agent.primedCodeFiles && agent.primedCodeFiles.length > 0) {
      sessions = seedCodeFilesIntoSessions(agent.primedCodeFiles, sessions);
    }
    if (agent.subagentAgentConfigs && agent.subagentAgentConfigs.length > 0) {
      for (const child of agent.subagentAgentConfigs) {
        if (child && !visited.has(child)) stack.push(child);
      }
    }
  }
  return sessions;
}
