import type {
  SkillSyncGitHubSourceConfig,
  SkillSyncGitLabSourceConfig,
} from 'librechat-data-provider';
import type { GitRepoAdapter } from './types';
import { createGitHubRepoAdapter } from './github';
import { createGitLabRepoAdapter } from './gitlab';

type FetchFn = typeof fetch;

export type RepoAdapterCredentials = {
  token: string;
  fetchFn: FetchFn;
};

export function createRepoAdapter(
  provider: 'github',
  source: SkillSyncGitHubSourceConfig,
  credentials: RepoAdapterCredentials,
): GitRepoAdapter;
export function createRepoAdapter(
  provider: 'gitlab',
  source: SkillSyncGitLabSourceConfig,
  credentials: RepoAdapterCredentials,
): GitRepoAdapter;
export function createRepoAdapter(
  provider: 'github' | 'gitlab',
  source: SkillSyncGitHubSourceConfig | SkillSyncGitLabSourceConfig,
  credentials: RepoAdapterCredentials,
): GitRepoAdapter {
  if (provider === 'github') {
    const githubSource = source as SkillSyncGitHubSourceConfig;
    return createGitHubRepoAdapter({
      owner: githubSource.owner,
      repo: githubSource.repo,
      token: credentials.token,
      fetchFn: credentials.fetchFn,
    });
  }
  const gitlabSource = source as SkillSyncGitLabSourceConfig;
  return createGitLabRepoAdapter({
    baseUrl: gitlabSource.baseUrl,
    projectId: gitlabSource.projectId,
    token: credentials.token,
    fetchFn: credentials.fetchFn,
  });
}
