import type { PullRequestSource } from './types';
import { routePullRequestSources } from './sources';

const input = { repo: 'o/r', branch: 'feat/x', token: 't' };

describe('routePullRequestSources', () => {
  const github: PullRequestSource = { find: jest.fn().mockResolvedValue(null) };
  const gitlab: PullRequestSource = { find: jest.fn().mockResolvedValue(null) };
  const source = routePullRequestSources({ github, gitlab });

  beforeEach(() => jest.clearAllMocks());

  it('asks GitHub when no provider is named, as before providers existed', async () => {
    await source.find(input);
    expect(github.find).toHaveBeenCalledWith(input);
    expect(gitlab.find).not.toHaveBeenCalled();
  });

  it('asks the named provider and no other', async () => {
    await source.find({ ...input, provider: 'gitlab' });
    expect(gitlab.find).toHaveBeenCalledTimes(1);
    expect(github.find).not.toHaveBeenCalled();
  });

  it('reports a provider without a source as not configured', async () => {
    await expect(source.find({ ...input, provider: 'bitbucket' })).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });
});
