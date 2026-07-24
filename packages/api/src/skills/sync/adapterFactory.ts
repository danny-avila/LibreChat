import type { SkillSyncProvider } from '@librechat/data-schemas';
import type { GitRepoAdapter } from './adapter';
import { GitHubRepoAdapter } from './githubAdapter';
import { GitLabRepoAdapter } from './gitlabAdapter';
import { BitbucketRepoAdapter } from './bitbucketAdapter';
import { AzureDevOpsRepoAdapter } from './azureDevOpsAdapter';

type FetchFn = typeof fetch;

export type AdapterSourceConfig = {
  provider: SkillSyncProvider;
  token: string;
  fetchFn?: FetchFn;
  // GitHub
  owner?: string;
  repo?: string;
  baseUrl?: string;
  // GitLab
  projectId?: string;
  // Bitbucket
  workspace?: string;
  repository?: string;
  // Azure DevOps
  organization?: string;
  project?: string;
};

export function createRepoAdapter(config: AdapterSourceConfig): GitRepoAdapter {
  switch (config.provider) {
    case 'github':
      if (!config.owner || !config.repo) {
        throw new Error('GitHub adapter requires owner and repo');
      }
      return new GitHubRepoAdapter({
        owner: config.owner,
        repo: config.repo,
        token: config.token,
        baseUrl: config.baseUrl,
        fetchFn: config.fetchFn,
      });
    case 'gitlab':
      if (!config.projectId) {
        throw new Error('GitLab adapter requires projectId');
      }
      return new GitLabRepoAdapter({
        projectId: config.projectId,
        token: config.token,
        baseUrl: config.baseUrl,
        fetchFn: config.fetchFn,
      });
    case 'bitbucket':
      if (!config.workspace || !config.repository) {
        throw new Error('Bitbucket adapter requires workspace and repository');
      }
      return new BitbucketRepoAdapter({
        workspace: config.workspace,
        repository: config.repository,
        token: config.token,
        baseUrl: config.baseUrl,
        fetchFn: config.fetchFn,
      });
    case 'azuredevops':
      if (!config.organization || !config.project || !config.repository) {
        throw new Error('Azure DevOps adapter requires organization, project, and repository');
      }
      return new AzureDevOpsRepoAdapter({
        organization: config.organization,
        project: config.project,
        repository: config.repository,
        token: config.token,
        baseUrl: config.baseUrl,
        fetchFn: config.fetchFn,
      });
    default:
      throw new Error(`Unsupported skill sync provider: ${config.provider as string}`);
  }
}
