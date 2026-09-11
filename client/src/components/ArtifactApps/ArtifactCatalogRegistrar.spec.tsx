import React from 'react';
import { act, render } from '@testing-library/react';
import { dataService } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import ArtifactCatalogRegistrar from './ArtifactCatalogRegistrar';

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockUseRecoilValue = jest.fn();
const mockUseArtifactsContext = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      syncArtifactApp: jest.fn(),
    },
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => mockUseRecoilValue(),
}));

jest.mock('~/Providers', () => ({
  useArtifactsContext: () => mockUseArtifactsContext(),
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { artifactsState: { key: 'artifactsState' } },
}));

jest.mock('~/utils', () => ({
  logger: { error: jest.fn() },
}));

const syncArtifactApp = jest.mocked(dataService.syncArtifactApp);

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'artifact-1',
    identifier: 'chart',
    title: 'Revenue chart',
    type: 'application/vnd.react',
    content: 'export default () => <div>chart</div>;',
    messageId: 'message-1',
    lastUpdateTime: 1,
    ...overrides,
  };
}

describe('ArtifactCatalogRegistrar', () => {
  let artifacts: Record<string, Artifact | undefined>;
  let context: { conversationId: string; isSubmitting: boolean; latestMessageId: string | null };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    artifacts = { 'artifact-1': makeArtifact() };
    context = {
      conversationId: 'conversation-1',
      isSubmitting: false,
      latestMessageId: 'message-1',
    };
    mockUseRecoilValue.mockImplementation(() => artifacts);
    mockUseArtifactsContext.mockImplementation(() => context);
    syncArtifactApp.mockResolvedValue({
      app: { artifactAppId: 'app-1' },
      version: { artifactVersionId: 'version-1' },
      created: true,
      versionCreated: true,
    } as Awaited<ReturnType<typeof dataService.syncArtifactApp>>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not synchronize artifacts while reading idle conversation history', async () => {
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    artifacts = { 'artifact-old': makeArtifact({ id: 'artifact-old', content: 'old snapshot' }) };
    context = {
      conversationId: 'conversation-old',
      isSubmitting: false,
      latestMessageId: 'message-old',
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(syncArtifactApp).not.toHaveBeenCalled();
  });

  it('synchronizes only artifacts changed by a completed generation', async () => {
    const unchanged = makeArtifact({ id: 'artifact-old', identifier: 'unchanged' });
    artifacts = { 'artifact-old': unchanged };
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);

    artifacts = {
      'artifact-old': unchanged,
      'artifact-new': makeArtifact({
        id: 'artifact-new',
        identifier: 'new-chart',
        messageId: 'message-2',
        lastUpdateTime: 2,
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: false, latestMessageId: 'message-2' };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(syncArtifactApp).toHaveBeenCalledTimes(1);
    expect(syncArtifactApp.mock.calls[0]?.[0].source.sourceKey).toContain('new-chart');
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['artifactApps']),
      refetchType: 'all',
    });
  });

  it('continues observing artifacts that resolve after the initial settle delay', async () => {
    artifacts = {};
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(61_000);
      await Promise.resolve();
    });
    expect(syncArtifactApp).not.toHaveBeenCalled();

    artifacts = {
      'artifact-delayed': makeArtifact({
        id: 'artifact-delayed',
        identifier: 'delayed-presentation',
        type: 'application/vnd.librechat.presentation-preview',
        content: '<html>presentation</html>',
        lastUpdateTime: 2,
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(syncArtifactApp).toHaveBeenCalledTimes(1);
    expect(syncArtifactApp.mock.calls[0]?.[0].artifact.type).toBe('presentation');
  });

  it('ignores delayed artifacts from a message outside the completed generation', async () => {
    artifacts = {};
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false, latestMessageId: 'message-new' };
    rerender(<ArtifactCatalogRegistrar />);

    artifacts = {
      'artifact-stale': makeArtifact({
        id: 'artifact-stale',
        identifier: 'stale-presentation',
        type: 'application/vnd.librechat.presentation-preview',
        content: '<html>stale presentation</html>',
        messageId: 'message-old',
        lastUpdateTime: 2,
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(syncArtifactApp).not.toHaveBeenCalled();
  });

  it('retries failed automatic registrations with backoff', async () => {
    artifacts = {};
    syncArtifactApp.mockRejectedValueOnce(new Error('temporary failure'));
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    artifacts = { 'artifact-new': makeArtifact({ id: 'artifact-new' }) };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);

    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncArtifactApp).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncArtifactApp).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent registration failures', async () => {
    artifacts = {};
    syncArtifactApp.mockRejectedValueOnce({ response: { status: 400 } });
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    artifacts = { 'artifact-new': makeArtifact({ id: 'artifact-new' }) };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(syncArtifactApp).toHaveBeenCalledTimes(1);
  });

  it('refreshes catalog scopes after metadata-only synchronization', async () => {
    syncArtifactApp.mockResolvedValueOnce({
      app: { artifactAppId: 'app-1' },
      version: { artifactVersionId: 'version-1' },
      created: false,
      versionCreated: false,
    } as Awaited<ReturnType<typeof dataService.syncArtifactApp>>);
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    artifacts = {
      'artifact-1': makeArtifact({ title: 'Renamed chart', lastUpdateTime: 2 }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: expect.arrayContaining(['artifactApps']),
      refetchType: 'all',
    });
  });
});
