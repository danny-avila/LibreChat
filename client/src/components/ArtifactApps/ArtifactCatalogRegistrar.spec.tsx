import React from 'react';
import { Constants } from 'librechat-data-provider';
import { act, render } from '@testing-library/react';
import type { Artifact } from '~/common';
import { enqueueArtifactSync } from '~/components/ArtifactApps/sync/queue';
import ArtifactCatalogRegistrar from './ArtifactCatalogRegistrar';

const mockUseRecoilValue = jest.fn();
const mockUseArtifactsContext = jest.fn();
let mockStartupConfig: { artifactApps?: Record<string, number> } | undefined;

jest.mock('recoil', () => ({
  useRecoilValue: () => mockUseRecoilValue(),
}));

jest.mock('~/Providers', () => ({
  useArtifactsContext: () => mockUseArtifactsContext(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('~/hooks/Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => true,
}));

jest.mock('~/components/ArtifactApps/sync/queue', () => ({
  enqueueArtifactSync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { artifactsState: { key: 'artifactsState' } },
}));

jest.mock('~/utils', () => ({
  logger: { error: jest.fn() },
}));

const mockEnqueueArtifactSync = jest.mocked(enqueueArtifactSync);

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
    jest.clearAllMocks();
    mockStartupConfig = undefined;
    artifacts = { 'artifact-1': makeArtifact() };
    context = {
      conversationId: 'conversation-1',
      isSubmitting: false,
      latestMessageId: 'message-1',
    };
    mockUseRecoilValue.mockImplementation(() => artifacts);
    mockUseArtifactsContext.mockImplementation(() => context);
  });

  it('does not register artifacts while reading idle conversation history', async () => {
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    artifacts = { 'artifact-old': makeArtifact({ id: 'artifact-old', content: 'old snapshot' }) };
    context = {
      conversationId: 'conversation-old',
      isSubmitting: false,
      latestMessageId: 'message-old',
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).not.toHaveBeenCalled();
  });

  it('persists only artifacts changed by a completed generation', async () => {
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
    context = { ...context, latestMessageId: 'message-2' };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueArtifactSync.mock.calls[0]?.[1].source.sourceKey).toContain('new-chart');
    expect(mockEnqueueArtifactSync.mock.calls[0]?.[3]).toBe(500);
  });

  it('continues observing previews that resolve after generation completion', async () => {
    artifacts = {};
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);

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
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueArtifactSync.mock.calls[0]?.[1].artifact.type).toBe('presentation');
  });

  it('keeps observing a completed generation while the next generation runs', async () => {
    artifacts = {};
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true, latestMessageId: 'message-a' };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: true, latestMessageId: 'message-b' };
    rerender(<ArtifactCatalogRegistrar />);

    artifacts = {
      'artifact-a': makeArtifact({
        id: 'artifact-a',
        identifier: 'generation-a',
        messageId: 'message-a',
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueArtifactSync.mock.calls[0]?.[1].source.messageId).toBe('message-a');
  });

  it('tracks a first generation when a new conversation receives its persisted id', async () => {
    artifacts = {};
    context = {
      conversationId: String(Constants.NEW_CONVO),
      isSubmitting: true,
      latestMessageId: 'message-new',
    };
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, conversationId: 'conversation-created' };
    artifacts = {
      'artifact-new': makeArtifact({
        id: 'artifact-new',
        messageId: 'message-new',
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).toHaveBeenCalledTimes(1);
    expect(mockEnqueueArtifactSync.mock.calls[0]?.[1].source.conversationId).toBe(
      'conversation-created',
    );
  });

  it('ignores delayed artifacts from a message outside a completed generation', async () => {
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
        messageId: 'message-old',
      }),
    };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync).not.toHaveBeenCalled();
  });

  it('uses the configured settle delay when persisting registration work', async () => {
    mockStartupConfig = { artifactApps: { clientSyncSettleDelayMs: 25 } };
    artifacts = {};
    const { rerender } = render(<ArtifactCatalogRegistrar />);

    context = { ...context, isSubmitting: true };
    rerender(<ArtifactCatalogRegistrar />);
    artifacts = { 'artifact-new': makeArtifact() };
    rerender(<ArtifactCatalogRegistrar />);
    context = { ...context, isSubmitting: false };
    rerender(<ArtifactCatalogRegistrar />);
    await act(async () => Promise.resolve());

    expect(mockEnqueueArtifactSync.mock.calls[0]?.[3]).toBe(25);
  });
});
