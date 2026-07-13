import { StepEvents } from 'librechat-data-provider';
import type { StreamEvent } from '~/types';
import { buildToolProgressEvent, createToolProgressEmitter } from './progress';

describe('buildToolProgressEvent', () => {
  it('builds the transient event with only the reported fields', () => {
    expect(
      buildToolProgressEvent('call_1', { progress: 3, total: 10, message: 'crunching' }),
    ).toEqual({
      event: StepEvents.ON_TOOL_PROGRESS,
      data: { toolCallId: 'call_1', progress: 3, total: 10, message: 'crunching' },
    });
    expect(buildToolProgressEvent('call_1', { progress: 0.4 })).toEqual({
      event: StepEvents.ON_TOOL_PROGRESS,
      data: { toolCallId: 'call_1', progress: 0.4 },
    });
  });

  it('caps oversized messages', () => {
    const event = buildToolProgressEvent('call_1', { progress: 1, message: 'x'.repeat(2_000) });
    expect((event.data as { message: string }).message).toHaveLength(500);
  });
});

describe('createToolProgressEmitter', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('throttles bursts but always passes the terminal notification', () => {
    const emitted: StreamEvent[] = [];
    const emit = createToolProgressEmitter({
      toolCallId: 'call_1',
      emit: (event) => {
        emitted.push(event);
      },
      minIntervalMs: 200,
    });

    emit({ progress: 1, total: 10 });
    emit({ progress: 2, total: 10 });
    emit({ progress: 3, total: 10 });
    expect(emitted).toHaveLength(1);

    jest.setSystemTime(250);
    emit({ progress: 4, total: 10 });
    expect(emitted).toHaveLength(2);

    emit({ progress: 10, total: 10 });
    expect(emitted).toHaveLength(3);
    expect((emitted[2].data as { progress: number }).progress).toBe(10);

    // repeated terminal notifications no longer bypass the throttle
    emit({ progress: 10, total: 10 });
    emit({ progress: 10, total: 10 });
    expect(emitted).toHaveLength(3);
    jest.setSystemTime(600);
    emit({ progress: 10, total: 10 });
    expect(emitted).toHaveLength(4);
  });

  it('never throws when the emit sink fails', () => {
    const emit = createToolProgressEmitter({
      toolCallId: 'call_1',
      emit: () => {
        throw new Error('stream closed');
      },
    });
    expect(() => emit({ progress: 1, total: 2 })).not.toThrow();
  });
});
