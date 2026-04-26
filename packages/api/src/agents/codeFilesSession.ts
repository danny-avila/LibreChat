import { Constants } from '@librechat/agents';
import type { FileRefs, CodeEnvFile, ToolSessionMap, CodeSessionContext } from '@librechat/agents';

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
