/**
 * Generic Git repository adapter interface for Skill Sync.
 *
 * Each provider (GitHub, GitLab, Bitbucket, Azure DevOps) implements this
 * interface to abstract away provider-specific REST API calls. The sync runner
 * consumes the adapter without knowing which provider backs it.
 */

export type GitTreeEntry = {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
};

export type GitRepoAdapterConfig = {
  /** Provider-specific source configuration (owner/repo, projectId, etc.) */
  source: Record<string, unknown>;
  /** Authentication token (PAT, app password, etc.) */
  token: string;
};

export interface GitRepoAdapter {
  /**
   * Resolve the tree SHA for a given ref (branch, tag, or commit).
   * Returns the root tree SHA that can be used for subsequent tree listings.
   */
  getTreeSha(ref: string): Promise<{ commitSha: string; treeSha: string }>;

  /**
   * List all file entries (blobs) under the given tree, recursively.
   * The returned paths are relative to the repository root.
   */
  listTree(treeSha: string, recursive?: boolean): Promise<GitTreeEntry[]>;

  /**
   * Fetch the raw content of a blob by its SHA or path reference.
   * Returns the file content as a Buffer.
   */
  fetchBlob(sha: string): Promise<Buffer>;
}
