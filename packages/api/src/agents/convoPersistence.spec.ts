import { createConvoPersistenceSignal } from './convoPersistence';

/** Resolves to true only if the gate is already open at this microtask depth. */
const isOpen = async (ready: Promise<void>): Promise<boolean> => {
  const sentinel = Symbol('shut');
  const result = await Promise.race([
    ready.then(() => 'open' as const),
    Promise.resolve().then(() => Promise.resolve().then(() => sentinel)),
  ]);
  return result === 'open';
};

const settled = () => new Promise((resolve) => setImmediate(resolve));

describe('createConvoPersistenceSignal', () => {
  it('starts shut, with no conversation reported', async () => {
    const signal = createConvoPersistenceSignal();

    await expect(isOpen(signal.ready)).resolves.toBe(false);
    expect(signal.reportedConversation()).toBe(false);
  });

  it('opens and reports when a write persisted a conversation', async () => {
    const signal = createConvoPersistenceSignal();

    signal.observeMessageWrite(
      Promise.resolve({ message: {}, conversation: { conversationId: 'convo-1' } }),
    );

    await expect(signal.ready).resolves.toBeUndefined();
    expect(signal.reportedConversation()).toBe(true);
  });

  it.each([
    ['persisted no conversation', () => Promise.resolve({ message: {} })],
    ['failed', () => Promise.reject(new Error('write failed'))],
    ['reported a null conversation', () => Promise.resolve({ conversation: null })],
    [
      'reported an empty conversationId',
      () => Promise.resolve({ conversation: { conversationId: '' } }),
    ],
  ])('stays shut and reports nothing when the write %s', async (_label, makeWrite) => {
    const signal = createConvoPersistenceSignal();

    signal.observeMessageWrite(makeWrite());
    await settled();

    await expect(isOpen(signal.ready)).resolves.toBe(false);
    expect(signal.reportedConversation()).toBe(false);
  });

  it('stays shut while the write is still pending', async () => {
    const signal = createConvoPersistenceSignal();
    let settle: (value: unknown) => void = () => {};
    signal.observeMessageWrite(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    await expect(isOpen(signal.ready)).resolves.toBe(false);
    expect(signal.reportedConversation()).toBe(false);

    settle({ conversation: { conversationId: 'convo-1' } });

    await expect(signal.ready).resolves.toBeUndefined();
    expect(signal.reportedConversation()).toBe(true);
  });

  it('ignores a value that is not a promise', async () => {
    const signal = createConvoPersistenceSignal();

    signal.observeMessageWrite(undefined);
    signal.observeMessageWrite({ conversation: { conversationId: 'convo-1' } });
    await settled();

    await expect(isOpen(signal.ready)).resolves.toBe(false);
    expect(signal.reportedConversation()).toBe(false);
  });

  /** The terminal backstop opens the gate for a title, but it is not evidence that
   *  any write recorded the row — the reference repair must still run. */
  it('does not report a conversation just because open() was called', async () => {
    const signal = createConvoPersistenceSignal();

    signal.open();
    signal.open();
    signal.observeMessageWrite(Promise.resolve({ message: {} }));
    await settled();

    await expect(signal.ready).resolves.toBeUndefined();
    expect(signal.reportedConversation()).toBe(false);
  });

  it('reports a conversation when a later write succeeds after an earlier one did not', async () => {
    const signal = createConvoPersistenceSignal();

    signal.observeMessageWrite(Promise.resolve({ message: {} }));
    signal.observeMessageWrite(Promise.resolve({ conversation: { conversationId: 'convo-1' } }));
    await settled();

    expect(signal.reportedConversation()).toBe(true);
  });
});
