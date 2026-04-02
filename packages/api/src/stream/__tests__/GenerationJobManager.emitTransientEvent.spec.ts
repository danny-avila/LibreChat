import type * as t from '~/types';

interface RuntimeState {
  abortController: AbortController;
  hasSubscriber: boolean;
}

class GenerationJobManagerStub {
  runtimeState = new Map<string, RuntimeState>();
  eventTransport = { emitChunk: jest.fn() };

  async emitTransientEvent(streamId: string, event: t.ServerSentEvent): Promise<void> {
    const runtime = this.runtimeState.get(streamId);
    if (!runtime || runtime.abortController.signal.aborted) {
      return;
    }
    if (!runtime.hasSubscriber) {
      return;
    }
    await this.eventTransport.emitChunk(streamId, event);
  }
}

function makeRuntime(overrides: Partial<RuntimeState> = {}): RuntimeState {
  return {
    abortController: new AbortController(),
    hasSubscriber: true,
    ...overrides,
  };
}

describe('GenerationJobManager - emitTransientEvent', () => {
  let manager: GenerationJobManagerStub;

  const streamId = 'stream-abc-123';
  const progressEvent: t.ServerSentEvent = {
    event: 'progress',
    data: { progress: 2, total: 5, message: 'Working…', toolCallId: 'call-1' },
  } as unknown as t.ServerSentEvent;

  beforeEach(() => {
    manager = new GenerationJobManagerStub();
    jest.clearAllMocks();
  });

  it('emits to transport when runtime exists and has subscriber', async () => {
    manager.runtimeState.set(streamId, makeRuntime());

    await manager.emitTransientEvent(streamId, progressEvent);

    expect(manager.eventTransport.emitChunk).toHaveBeenCalledTimes(1);
    expect(manager.eventTransport.emitChunk).toHaveBeenCalledWith(streamId, progressEvent);
  });

  it('silently drops when streamId has no runtime entry', async () => {
    await manager.emitTransientEvent('unknown-stream', progressEvent);

    expect(manager.eventTransport.emitChunk).not.toHaveBeenCalled();
  });

  it('silently drops when job has been aborted', async () => {
    const runtime = makeRuntime();
    runtime.abortController.abort();
    manager.runtimeState.set(streamId, runtime);

    await manager.emitTransientEvent(streamId, progressEvent);

    expect(manager.eventTransport.emitChunk).not.toHaveBeenCalled();
  });

  it('silently drops when there is no active subscriber', async () => {
    manager.runtimeState.set(streamId, makeRuntime({ hasSubscriber: false }));

    await manager.emitTransientEvent(streamId, progressEvent);

    expect(manager.eventTransport.emitChunk).not.toHaveBeenCalled();
  });

  it('does not persist the event (calls emitChunk directly, not appendChunk)', async () => {
    const appendChunk = jest.fn();
    (manager as unknown as Record<string, unknown>).appendChunk = appendChunk;
    manager.runtimeState.set(streamId, makeRuntime());

    await manager.emitTransientEvent(streamId, progressEvent);

    expect(appendChunk).not.toHaveBeenCalled();
    expect(manager.eventTransport.emitChunk).toHaveBeenCalled();
  });

  it('forwards any event shape without mutation', async () => {
    manager.runtimeState.set(streamId, makeRuntime());

    const customEvent = { event: 'progress', data: { foo: 'bar' } } as unknown as t.ServerSentEvent;
    await manager.emitTransientEvent(streamId, customEvent);

    expect(manager.eventTransport.emitChunk).toHaveBeenCalledWith(streamId, customEvent);
  });

  it('handles transport throwing without crashing the caller', async () => {
    manager.runtimeState.set(streamId, makeRuntime());
    manager.eventTransport.emitChunk.mockRejectedValueOnce(new Error('transport error'));

    await expect(manager.emitTransientEvent(streamId, progressEvent)).rejects.toThrow(
      'transport error',
    );
  });

  it('does not emit after abort even if subscriber flag is still true', async () => {
    const runtime = makeRuntime({ hasSubscriber: true });
    manager.runtimeState.set(streamId, runtime);

    // Abort happens between registration and emit
    runtime.abortController.abort();

    await manager.emitTransientEvent(streamId, progressEvent);

    expect(manager.eventTransport.emitChunk).not.toHaveBeenCalled();
  });
});
