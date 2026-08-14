import { Constants } from '@librechat/agents';
import type { FileRefs, CodeEnvFile, ToolSessionMap, CodeSessionContext } from '@librechat/agents';

/**
 * Minimal shape for an agent that may contribute primed code files to its
 * execution-profile partition. Both `InitializedAgent` and `RunAgent` satisfy it,
 * and the recursive walk in {@link buildInitialToolSessions} traverses
 * `subagentAgentConfigs` so nested subagents (which aren't in the top-level
 * `agentConfigs` map after pure-subagent pruning) still contribute.
 */
export interface CodeFilesAgent {
  codeSessionKey?: string;
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
 * per-file `storage_session_id`s (the long-lived storage bucket id). The
 * map's representative top-level `session_id` is seeded from the first
 * incoming file's `storage_session_id` (matching `primeInvokedSkills`),
 * since no execution session exists yet at seed time. Per-file ids on the
 * `files` array are what `ToolNode` actually uses
 * (`file.storage_session_id ?? execSessionId`).
 *
 * When an entry already exists (e.g. seeded by `primeInvokedSkills` for skill
 * files), incoming files are appended after the existing ones. The pre-existing
 * representative `session_id` is preserved so a partial-cache/fresh-prime
 * collision doesn't shift which session id `ToolNode` picks for the call.
 *
 * Files are deduplicated by `storage_session_id + id` as the stable
 * identity key. Multiple agents in the same run commonly carry the same
 * primed code-execution resources (shared conversation files), and without
 * dedupe `_injected_files` would grow proportionally to agent count and
 * inflate every `/exec` POST. First-seen wins so the original ordering /
 * source is preserved.
 */
export function seedCodeFilesIntoSessions(
  files: CodeEnvFile[] | undefined,
  existing: ToolSessionMap | undefined,
  sessionKey: string = Constants.EXECUTE_CODE,
): ToolSessionMap | undefined {
  if (!files || files.length === 0) {
    return existing;
  }

  const sessions: ToolSessionMap = existing ?? new Map();
  const prior = sessions.get(sessionKey) as CodeSessionContext | undefined;

  /**
   * Compose `(storage_session_id, id)` as a stable identity. `name` alone
   * isn't sufficient — two distinct primed uploads can share a filename
   * (different storage sessions, different file_ids). The composite stays
   * cheap to compute and the keys are short uuids.
   */
  const seenKeys = new Set<string>();
  const mergedFiles: FileRefs = [];
  const pushIfFresh = (f: { id?: string; storage_session_id?: string; name?: string }): void => {
    const key = `${f.storage_session_id ?? ''}\0${f.id ?? ''}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    mergedFiles.push(f as FileRefs[number]);
  };
  if (prior?.files) {
    for (const f of prior.files) pushIfFresh(f);
  }
  for (const f of files) pushIfFresh(f);

  /* Representative top-level `session_id` for the seed CodeSessionContext.
   * No execution session exists yet at seed time, so the first incoming
   * file's `storage_session_id` stands in until the first `/exec` call
   * returns a real execution session id. ToolNode reads per-file
   * `storage_session_id` for actual injection — the representative is
   * informational rather than load-bearing. Mirrors the same convention
   * used in `primeInvokedSkills`. */
  const representativeSessionId = prior?.session_id ?? files[0].storage_session_id;
  if (!representativeSessionId) {
    return existing;
  }

  sessions.set(sessionKey, {
    session_id: representativeSessionId,
    files: mergedFiles,
    lastUpdated: Date.now(),
  } satisfies CodeSessionContext);

  return sessions;
}

/**
 * Builds the run-wide `ToolSessionMap` for `Graph.sessions`, partitioned by
 * each agent's trusted `codeSessionKey`. The legacy `execute_code` partition
 * remains shared by stateless agents. Stateful agents share only when their
 * configured environment resolves to the same key.
 *
 * Skill files are immutable input resources for the run, so the initial
 * default skill seed is copied once into every non-default partition that
 * appears. Agent-produced session ids and files never cross partitions.
 *
 * **Walk order:** primary first, then `agentConfigs` (handoff/addedConvo)
 * in iteration order, then recurse into each config's
 * `subagentAgentConfigs` breadth-first. Order matters because when no
 * skill sessions exist, the FIRST agent's first file supplies the
 * representative `session_id` written to `Graph.sessions[EXECUTE_CODE]`.
 * `ToolNode` ultimately uses per-file `session_id`s for injection so
 * the representative is informational rather than load-bearing, but
 * primary-first keeps it predictable and matches the existing
 * `loadSubagentsFor` walk pattern in `Endpoints/agents/initialize.js`.
 *
 * The visited set is keyed by object identity (`Set<CodeFilesAgent>`)
 * so cycles in a malformed agent graph (a subagent that points back at
 * its parent) can't infinite-loop the seed.
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
  const initialSkillSession = skillSessions?.get(Constants.EXECUTE_CODE) as
    | CodeSessionContext
    | undefined;
  const initialSkillFiles = initialSkillSession?.files
    ? ([...initialSkillSession.files] as CodeEnvFile[])
    : undefined;
  const skillSeededPartitions = new Set<string>();
  const visited = new Set<CodeFilesAgent>();
  /**
   * FIFO queue: primary lands at index 0 and gets visited first, so its
   * first file is what `seedCodeFilesIntoSessions` records as the
   * representative `session_id` (when no skill seed exists). A LIFO
   * stack (`pop()`) would visit the last top-level agent first and
   * silently flip which agent supplies that id. `Array.shift()` is
   * O(n); the agent set is small (handoff + subagents, typically <20)
   * so the overhead is negligible vs. the readability win.
   */
  const queue: CodeFilesAgent[] = [];
  for (const a of agents) {
    if (a) queue.push(a);
  }
  while (queue.length > 0) {
    const agent = queue.shift()!;
    if (visited.has(agent)) continue;
    visited.add(agent);
    const sessionKey = agent.codeSessionKey ?? Constants.EXECUTE_CODE;
    if (
      sessionKey !== Constants.EXECUTE_CODE &&
      !skillSeededPartitions.has(sessionKey) &&
      initialSkillFiles?.length
    ) {
      sessions = seedCodeFilesIntoSessions(initialSkillFiles, sessions, sessionKey);
      skillSeededPartitions.add(sessionKey);
    }
    if (agent.primedCodeFiles && agent.primedCodeFiles.length > 0) {
      sessions = seedCodeFilesIntoSessions(agent.primedCodeFiles, sessions, sessionKey);
    }
    if (agent.subagentAgentConfigs && agent.subagentAgentConfigs.length > 0) {
      for (const child of agent.subagentAgentConfigs) {
        if (child && !visited.has(child)) queue.push(child);
      }
    }
  }
  return sessions;
}
