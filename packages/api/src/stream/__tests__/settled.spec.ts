import type { GenerationSettledEvent, GenerationSettledListener } from '../GenerationJobManager';
import type { GenerationJobStatus } from '../../types/stream';
import { waitForGenerationSettled } from '../settled';

function createSource(initial: Record<string, GenerationJobStatus>) {
  const statuses = new Map(Object.entries(initial));
  const listeners = new Set<GenerationSettledListener>();
  return {
    statuses,
    listeners,
    getJobStatus: jest.fn(async (streamId: string) => statuses.get(streamId)),
    onGenerationSettled: (listener: GenerationSettledListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    settle(event: Omit<GenerationSettledEvent, 'streamId' | 'userId'>) {
      statuses.set(event.conversationId, event.status as GenerationJobStatus);
      for (const listener of listeners) {
        listener({ ...event, streamId: event.conversationId, userId: 'user-1' });
      }
    },
  };
}

describe('waitForGenerationSettled', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['no generation', {}],
    ['a completed generation', { 'conversation-1': 'complete' as const }],
  ])('resolves false at once for %s', async (_label, initial) => {
    const source = createSource(initial);

    await expect(waitForGenerationSettled(source, 'conversation-1')).resolves.toBe(false);
    expect(source.listeners.size).toBe(0);
  });

  it('resolves when this conversation settles, ignoring others', async () => {
    const source = createSource({ 'conversation-1': 'running', 'conversation-2': 'running' });
    let resolved: boolean | undefined;
    void waitForGenerationSettled(source, 'conversation-1').then((settled) => {
      resolved = settled;
    });
    await jest.advanceTimersByTimeAsync(0);

    source.settle({ conversationId: 'conversation-2', status: 'complete' });
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toBeUndefined();

    source.settle({ conversationId: 'conversation-1', status: 'complete' });
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    expect(source.listeners.size).toBe(0);
  });

  it('waits through an approval pause', async () => {
    const source = createSource({ 'conversation-1': 'requires_action' });
    let resolved: boolean | undefined;
    void waitForGenerationSettled(source, 'conversation-1', { recheckMs: 1_000 }).then(
      (settled) => {
        resolved = settled;
      },
    );

    await jest.advanceTimersByTimeAsync(5_000);
    expect(resolved).toBeUndefined();
  });

  it('observes a generation that settles on another replica', async () => {
    const source = createSource({ 'conversation-1': 'running' });
    const waiting = waitForGenerationSettled(source, 'conversation-1', { recheckMs: 1_000 });
    await jest.advanceTimersByTimeAsync(0);

    source.statuses.set('conversation-1', 'complete');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(waiting).resolves.toBe(true);
    expect(source.listeners.size).toBe(0);
  });

  it('keeps waiting for as long as the generation stays active by default', async () => {
    const source = createSource({ 'conversation-1': 'running' });
    let resolved: boolean | undefined;
    void waitForGenerationSettled(source, 'conversation-1', { recheckMs: 60 * 60 * 1_000 }).then(
      (settled) => {
        resolved = settled;
      },
    );

    await jest.advanceTimersByTimeAsync(48 * 60 * 60 * 1_000);
    expect(resolved).toBeUndefined();

    source.settle({ conversationId: 'conversation-1', status: 'complete' });
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it('gives up after the maximum wait', async () => {
    const source = createSource({ 'conversation-1': 'running' });
    const waiting = waitForGenerationSettled(source, 'conversation-1', {
      recheckMs: 1_000,
      maxWaitMs: 10_000,
    });

    await jest.advanceTimersByTimeAsync(10_000);

    await expect(waiting).resolves.toBe(false);
    expect(source.listeners.size).toBe(0);
  });

  it('does not wait when the status cannot be read', async () => {
    const source = createSource({ 'conversation-1': 'running' });
    source.getJobStatus.mockRejectedValueOnce(new Error('job store unavailable'));

    await expect(waitForGenerationSettled(source, 'conversation-1')).resolves.toBe(false);
  });
});
