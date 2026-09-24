import { FileSources } from 'librechat-data-provider';
import {
  refreshAgentListAvatarsBeforePage,
  refreshManagedAgentListPageAvatars,
} from './listingAvatars';

const visible = { id: 'agent-visible', avatar: { source: FileSources.s3, filepath: 'old.jpg' } };
const nextPage = { id: 'agent-next', avatar: { source: FileSources.s3, filepath: 'next.jpg' } };
const local = { id: 'agent-local', avatar: { source: FileSources.local, filepath: 'local.jpg' } };

function params() {
  return {
    accessibleIds: null,
    agents: [visible, local],
    cachedEntry: null,
    refreshS3Url: jest.fn().mockResolvedValue('signed-visible.jpg'),
    cacheSet: jest.fn().mockResolvedValue(undefined),
    cacheKey: 'user:tenant:avatars',
    ttl: 1800,
  };
}

describe('Agent listing avatar scope', () => {
  it('does not load every tenant avatar before a manager list query', async () => {
    const refreshAll = jest.fn().mockResolvedValue({ urlCache: { 'agent-visible': 'signed.jpg' } });
    await expect(refreshAgentListAvatarsBeforePage(null, null, refreshAll)).resolves.toBeNull();
    expect(refreshAll).not.toHaveBeenCalled();

    const previous = { urlCache: { 'agent-visible': 'signed.jpg' } };
    await expect(refreshAgentListAvatarsBeforePage(null, previous, refreshAll)).resolves.toEqual(
      previous,
    );
    expect(refreshAll).not.toHaveBeenCalled();
    await expect(refreshAgentListAvatarsBeforePage([], null, refreshAll)).resolves.toEqual(
      previous,
    );
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it('presigns only the manager search page without writing agent documents', async () => {
    const options = params();
    const result = await refreshManagedAgentListPageAvatars(options);

    expect(options.refreshS3Url).toHaveBeenCalledTimes(1);
    expect(options.refreshS3Url).toHaveBeenCalledWith(visible.avatar);
    expect(result?.urlCache).toEqual({ 'agent-visible': 'signed-visible.jpg' });
    expect(options.cacheSet).toHaveBeenCalledWith(options.cacheKey, result, options.ttl);

    await refreshManagedAgentListPageAvatars({
      ...options,
      cachedEntry: result,
      agents: [visible],
    });
    expect(options.refreshS3Url).toHaveBeenCalledTimes(1);

    await refreshManagedAgentListPageAvatars({
      ...options,
      cachedEntry: result,
      agents: [nextPage],
    });
    expect(options.refreshS3Url).toHaveBeenCalledTimes(2);
  });

  it('leaves an ordinary ACL viewer on the pre-query full-list refresh path', async () => {
    const options = params();
    const previous = { urlCache: { 'agent-visible': 'signed.jpg' } };
    const result = await refreshManagedAgentListPageAvatars({
      ...options,
      accessibleIds: ['507f1f77bcf86cd799439011'],
      cachedEntry: previous,
    });
    expect(result).toBe(previous);
    expect(options.refreshS3Url).not.toHaveBeenCalled();
    expect(options.cacheSet).not.toHaveBeenCalled();
  });

  it('allows retry after an S3 failure without failing the list response', async () => {
    const options = params();
    options.refreshS3Url.mockRejectedValueOnce(new Error('S3 unavailable'));
    const result = await refreshManagedAgentListPageAvatars(options);
    expect(result?.urlCache).toEqual({});
    expect(options.cacheSet).not.toHaveBeenCalled();
    await refreshManagedAgentListPageAvatars({ ...options, cachedEntry: result });
    expect(options.cacheSet).toHaveBeenCalledTimes(1);
  });
});
