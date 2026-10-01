import type { TMessage } from 'librechat-data-provider';
import { resolveDetachedRunEnd } from '../queue';

const CONVO_ID = 'convo-detached';
const USER_ID = 'user-1';

const response = (overrides: Partial<TMessage> = {}): TMessage =>
  ({
    messageId: 'response-1',
    parentMessageId: USER_ID,
    conversationId: CONVO_ID,
    isCreatedByUser: false,
    text: 'done',
    ...overrides,
  }) as TMessage;

const userMessage = { messageId: USER_ID, isCreatedByUser: true } as TMessage;

describe('resolveDetachedRunEnd', () => {
  it('reports a completed run with its persisted response', () => {
    const end = resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, [
      userMessage,
      response(),
    ]);
    expect(end).toEqual(
      expect.objectContaining({
        conversationId: CONVO_ID,
        outcome: 'completed',
        responseMessageId: 'response-1',
      }),
    );
  });

  it('reports a failed run as an error, so the queue waits for a manual send', () => {
    const end = resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, [
      response({ error: true }),
    ]);
    expect(end?.outcome).toBe('error');
    expect(end?.responseMessageId).toBeUndefined();
  });

  it('reports an unfinished response as aborted', () => {
    const end = resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, [
      response({ unfinished: true }),
    ]);
    expect(end?.outcome).toBe('aborted');
  });

  it('returns nothing while no response to the run is persisted', () => {
    expect(resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, [userMessage])).toBeNull();
    expect(resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, undefined)).toBeNull();
  });

  it('picks the response the run created among regenerated siblings', () => {
    const end = resolveDetachedRunEnd(
      CONVO_ID,
      { userMessageId: USER_ID, responseMessageId: 'response-2_' },
      [response({ messageId: 'response-1', error: true }), response({ messageId: 'response-2' })],
    );
    expect(end).toEqual(
      expect.objectContaining({ outcome: 'completed', responseMessageId: 'response-2' }),
    );
  });

  it('does not guess between siblings when the run named no response', () => {
    expect(
      resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID }, [
        response({ messageId: 'response-1' }),
        response({ messageId: 'response-2' }),
      ]),
    ).toBeNull();
  });
});
