import type { TMessage } from 'librechat-data-provider';
import { resolveDetachedRunEnd, canResolveDetachedRun, isStoppedRun } from '../queue';

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

const writtenAt = (epoch: number) => new Date(epoch).toISOString();

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

  it('matches a persisted response id that itself ends in an underscore', () => {
    const end = resolveDetachedRunEnd(
      CONVO_ID,
      { userMessageId: USER_ID, responseMessageId: 'response-2_' },
      [response({ messageId: 'response-1' }), response({ messageId: 'response-2_' })],
    );
    expect(end?.responseMessageId).toBe('response-2_');
  });

  it('leaves a run unresolved when the response it named is not loaded', () => {
    expect(
      resolveDetachedRunEnd(CONVO_ID, { userMessageId: USER_ID, responseMessageId: 'response-2' }, [
        response({ messageId: 'response-1' }),
      ]),
    ).toBeNull();
  });

  it('treats the padded user id placeholder as naming no response', () => {
    const end = resolveDetachedRunEnd(
      CONVO_ID,
      { userMessageId: USER_ID, responseMessageId: `${USER_ID}_` },
      [response({ messageId: 'server-response' })],
    );
    expect(end?.responseMessageId).toBe('server-response');
  });

  it('leaves a regeneration without its epoch unresolved, since history still holds the reply it replaces', () => {
    expect(
      resolveDetachedRunEnd(
        CONVO_ID,
        { userMessageId: USER_ID, responseMessageId: 'response-1_', isRegenerate: true },
        [response({ messageId: 'response-1' })],
      ),
    ).toBeNull();
  });

  it('carries the run epoch so the drain can match server admission receipts', () => {
    const end = resolveDetachedRunEnd(
      CONVO_ID,
      { userMessageId: USER_ID, generationCreatedAt: 4200 },
      [response({ updatedAt: writtenAt(4300) })],
    );
    expect(end?.generationCreatedAt).toBe(4200);
  });

  it('rejects the reply a regeneration replaces and resolves the one the run wrote', () => {
    const run = {
      userMessageId: USER_ID,
      responseMessageId: 'response-1_',
      isRegenerate: true,
      generationCreatedAt: 5000,
    };
    const replaced = response({ messageId: 'response-1', updatedAt: writtenAt(4000) });
    expect(resolveDetachedRunEnd(CONVO_ID, run, [replaced])).toBeNull();
    const end = resolveDetachedRunEnd(CONVO_ID, run, [
      replaced,
      response({ messageId: 'response-2', unfinished: true, updatedAt: writtenAt(6000) }),
    ]);
    expect(end).toEqual(expect.objectContaining({ outcome: 'aborted', generationCreatedAt: 5000 }));
  });

  it('ignores a row the run never wrote, even under the id it named', () => {
    expect(
      resolveDetachedRunEnd(
        CONVO_ID,
        { userMessageId: USER_ID, responseMessageId: 'response-1', generationCreatedAt: 5000 },
        [
          response({ messageId: 'response-1', updatedAt: writtenAt(4999) }),
          response({ messageId: 'other' }),
        ],
      ),
    ).toBeNull();
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

describe('canResolveDetachedRun', () => {
  it('can date a regeneration only by its epoch', () => {
    expect(canResolveDetachedRun({ userMessageId: USER_ID })).toBe(true);
    expect(canResolveDetachedRun({ userMessageId: USER_ID, isRegenerate: true })).toBe(false);
    expect(
      canResolveDetachedRun({ userMessageId: USER_ID, isRegenerate: true, generationCreatedAt: 1 }),
    ).toBe(true);
  });
});

describe('isStoppedRun', () => {
  it('holds a Stop to the run it was pressed on', () => {
    const stopped = { generationCreatedAt: 1000 };
    expect(isStoppedRun(null, 1000)).toBe(false);
    expect(isStoppedRun(stopped, 1000)).toBe(true);
    expect(isStoppedRun(stopped, 2000)).toBe(false);
    expect(isStoppedRun(stopped, undefined)).toBe(true);
  });
});
