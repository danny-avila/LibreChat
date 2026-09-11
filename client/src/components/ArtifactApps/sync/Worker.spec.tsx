import React from 'react';
import { act, render } from '@testing-library/react';
import { dataService } from 'librechat-data-provider';
import {
  completeArtifactSync,
  listArtifactSyncQueue,
  rescheduleArtifactSync,
  subscribeToArtifactSyncQueue,
} from './queue';
import ArtifactSyncWorker from './Worker';

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, syncArtifactApp: jest.fn() },
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('~/utils', () => ({ logger: { error: jest.fn() } }));

jest.mock('./queue', () => ({
  completeArtifactSync: jest.fn(),
  listArtifactSyncQueue: jest.fn(),
  rescheduleArtifactSync: jest.fn(),
  subscribeToArtifactSyncQueue: jest.fn(() => () => undefined),
}));

const entry = {
  id: 'queue-1',
  ownerId: 'user-1',
  request: {
    title: 'Chart',
    artifact: { type: 'react' as const, content: '<div />' },
    source: { conversationId: 'conversation-1', sourceKey: 'identifier:chart' },
  },
  signature: 'signature-1',
  failures: 0,
  nextAttemptAt: 0,
  updatedAt: 0,
};

describe('ArtifactSyncWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(subscribeToArtifactSyncQueue).mockReturnValue(() => undefined);
    jest.mocked(listArtifactSyncQueue).mockResolvedValueOnce([entry]).mockResolvedValue([]);
    jest.mocked(dataService.syncArtifactApp).mockResolvedValue({
      app: { artifactAppId: 'app-1' },
      version: { artifactVersionId: 'version-1' },
      created: true,
      versionCreated: true,
    } as Awaited<ReturnType<typeof dataService.syncArtifactApp>>);
  });

  it('resumes persisted work immediately when the authenticated root mounts', async () => {
    render(<ArtifactSyncWorker />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataService.syncArtifactApp).toHaveBeenCalledWith(entry.request);
    expect(completeArtifactSync).toHaveBeenCalledWith(entry.id, entry.signature);
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('keeps transient failures in the persistent queue with backoff', async () => {
    jest.mocked(dataService.syncArtifactApp).mockRejectedValueOnce(new Error('temporary'));
    render(<ArtifactSyncWorker />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rescheduleArtifactSync).toHaveBeenCalledWith(entry.id, entry.signature, 1000);
    expect(completeArtifactSync).not.toHaveBeenCalled();
  });
});
