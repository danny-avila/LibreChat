import React from 'react';
import { dataService } from 'librechat-data-provider';
import { act, render, waitFor } from '@testing-library/react';
import {
  completeArtifactSync,
  listArtifactSyncQueue,
  rescheduleArtifactSync,
  subscribeToArtifactSyncQueue,
} from './queue';
import ArtifactSyncWorker from './Worker';

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
let mockUserId: string | null = 'user-1';

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
    removeQueries: mockRemoveQueries,
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: mockUserId ? { id: mockUserId } : null }),
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
    mockUserId = 'user-1';
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

  it.each([401, 404])(
    'keeps HTTP %i failures queued for auth or rollout recovery',
    async (status) => {
      jest.mocked(dataService.syncArtifactApp).mockRejectedValueOnce({ response: { status } });
      render(<ArtifactSyncWorker />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(rescheduleArtifactSync).toHaveBeenCalledWith(entry.id, entry.signature, 1000);
      expect(completeArtifactSync).not.toHaveBeenCalled();
    },
  );

  it('discards a queue entry only when the server confirms its source was deleted', async () => {
    jest.mocked(dataService.syncArtifactApp).mockRejectedValueOnce({ response: { status: 410 } });
    render(<ArtifactSyncWorker />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(completeArtifactSync).toHaveBeenCalledWith(entry.id, entry.signature);
    expect(rescheduleArtifactSync).not.toHaveBeenCalled();
  });

  it('stops an active flush when the authenticated identity changes', async () => {
    let resolveFirst: (
      value: Awaited<ReturnType<typeof dataService.syncArtifactApp>>,
    ) => void = () => undefined;
    const firstRequest = new Promise<Awaited<ReturnType<typeof dataService.syncArtifactApp>>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const secondEntry = {
      ...entry,
      id: 'queue-2',
      signature: 'signature-2',
      request: {
        ...entry.request,
        source: { ...entry.request.source, sourceKey: 'artifact:v1:identifier:second' },
      },
    };
    jest
      .mocked(listArtifactSyncQueue)
      .mockReset()
      .mockResolvedValueOnce([entry, secondEntry])
      .mockResolvedValue([]);
    jest.mocked(dataService.syncArtifactApp).mockReset().mockReturnValueOnce(firstRequest);

    const { rerender } = render(<ArtifactSyncWorker />);
    await waitFor(() => expect(dataService.syncArtifactApp).toHaveBeenCalledTimes(1));

    mockUserId = 'user-2';
    rerender(<ArtifactSyncWorker />);
    resolveFirst({
      app: { artifactAppId: 'app-1' },
      version: { artifactVersionId: 'version-1' },
      created: true,
      versionCreated: true,
    } as Awaited<ReturnType<typeof dataService.syncArtifactApp>>);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataService.syncArtifactApp).toHaveBeenCalledTimes(1);
    expect(mockSetQueryData).not.toHaveBeenCalled();
    expect(completeArtifactSync).not.toHaveBeenCalled();
  });
});
