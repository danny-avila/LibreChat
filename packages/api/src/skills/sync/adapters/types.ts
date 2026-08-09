export type RepoTreeEntryType = 'blob' | 'tree';

/**
 * `id` is the provider's content-addressable identifier for the entry (GitHub
 * blob/tree sha, GitLab blob/tree id). It is round-tripped into `fetchFileContent`
 * and persisted in `sourceMetadata` to detect unchanged files across syncs without
 * re-downloading their content.
 */
export type RepoTreeEntry = {
  path: string;
  type: RepoTreeEntryType;
  id: string;
  size?: number;
};

export type RepoCommit = {
  /** Identifier persisted as the sync's `commitSha`, opaque outside the adapter. */
  id: string;
  /**
   * Root tree identifier as of this commit — the entry point `fetchTreeEntries`
   * walks from. Distinct from `id` on providers (GitHub) whose commit and tree
   * objects are addressed separately; equal to `id` where a provider has no such
   * distinction.
   */
  treeId: string;
};

/**
 * Surface a rate-limit/auth distinction as thrown errors (matching how the
 * orchestration already classifies GitHub failures) rather than a boolean method,
 * since every adapter call already needs try/catch for HTTP-status handling.
 */
export class RepoAdapterError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepoAdapterError';
    this.code = code;
  }
}

export type FetchTreeParams = {
  ref: string;
  pathPrefix: string;
  assertNotCancelled: () => void;
};

export type FetchFileContentParams = {
  ref: string;
  entry: RepoTreeEntry;
};

/**
 * The REST-specific surface every skill-sync source implementation must provide.
 * Generic orchestration (skill discovery, DB upsert/cleanup, sync counters) lives
 * outside adapters and depends only on this interface, never on a provider's HTTP
 * shape directly.
 */
export interface GitRepoAdapter {
  /**
   * Resolves `ref` (branch, tag, or commit-ish) to the commit that pins this
   * sync run, so every file fetched within the run is consistent even if the
   * upstream ref moves mid-sync.
   */
  resolveCommit(ref: string): Promise<RepoCommit>;

  /**
   * Lists all blob/tree entries recursively under `pathPrefix` (relative to the
   * repo root) as of `commit`. Paths are returned relative to the repo root, not
   * to `pathPrefix`, so callers can merge entries from multiple configured paths
   * without ambiguity.
   */
  fetchTreeEntries(commit: RepoCommit, params: FetchTreeParams): Promise<RepoTreeEntry[]>;

  /**
   * Fetches raw file content for a single tree entry. `entry.size` (if present)
   * has already been validated by the caller against the skill-import size
   * limits before this is called, so implementations do not need to re-check it.
   */
  fetchFileContent(commit: RepoCommit, params: FetchFileContentParams): Promise<Buffer>;
}
