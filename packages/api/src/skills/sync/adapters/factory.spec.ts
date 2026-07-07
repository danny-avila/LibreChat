import type {
  SkillSyncGitHubSourceConfig,
  SkillSyncGitLabSourceConfig,
} from 'librechat-data-provider';
import { createRepoAdapter } from './factory';

const githubSource: SkillSyncGitHubSourceConfig = {
  id: 'librechat-skills',
  owner: 'LibreChat',
  repo: 'skills',
  ref: 'main',
  paths: ['skills'],
  credentialKey: 'github-skills-prod',
};

const gitlabSource: SkillSyncGitLabSourceConfig = {
  id: 'librechat-skills-gitlab',
  projectId: 'group%2Fskills',
  ref: 'main',
  paths: ['skills'],
  credentialKey: 'gitlab-skills-prod',
};

function credentials() {
  return { token: 'secret-token', fetchFn: jest.fn() as unknown as typeof fetch };
}

describe('createRepoAdapter', () => {
  it('creates a GitHub adapter exposing the shared GitRepoAdapter surface', () => {
    const adapter = createRepoAdapter('github', githubSource, credentials());
    expect(typeof adapter.resolveCommit).toBe('function');
    expect(typeof adapter.fetchTreeEntries).toBe('function');
    expect(typeof adapter.fetchFileContent).toBe('function');
  });

  it('creates a GitLab adapter exposing the shared GitRepoAdapter surface', () => {
    const adapter = createRepoAdapter('gitlab', gitlabSource, credentials());
    expect(typeof adapter.resolveCommit).toBe('function');
    expect(typeof adapter.fetchTreeEntries).toBe('function');
    expect(typeof adapter.fetchFileContent).toBe('function');
  });

  it('routes a GitHub source through the GitHub REST API base', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } }),
    })) as unknown as typeof fetch;
    const adapter = createRepoAdapter('github', githubSource, { token: 't', fetchFn });
    await adapter.resolveCommit('main');
    const [calledUrl] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect(calledUrl.toString()).toContain('api.github.com');
  });

  it('routes a GitLab source through the GitLab REST API base', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: 'commit-sha' }),
    })) as unknown as typeof fetch;
    const adapter = createRepoAdapter('gitlab', gitlabSource, { token: 't', fetchFn });
    await adapter.resolveCommit('main');
    const [calledUrl] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect(calledUrl.toString()).toContain('gitlab.com/api/v4');
  });

  it('honors a self-hosted GitLab baseUrl when routing', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: 'commit-sha' }),
    })) as unknown as typeof fetch;
    const source: SkillSyncGitLabSourceConfig = {
      ...gitlabSource,
      baseUrl: 'https://gitlab.internal.example.com',
    };
    const adapter = createRepoAdapter('gitlab', source, { token: 't', fetchFn });
    await adapter.resolveCommit('main');
    const [calledUrl] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect(calledUrl.toString()).toContain('gitlab.internal.example.com/api/v4');
  });
});
