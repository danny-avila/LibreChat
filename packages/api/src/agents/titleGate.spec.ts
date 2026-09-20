import { createTitlePersistenceGate } from './titleGate';

/** Resolves to true only if the gate is already open at this microtask depth. */
const isOpen = async (ready: Promise<void>): Promise<boolean> => {
  const sentinel = Symbol('shut');
  const result = await Promise.race([
    ready.then(() => 'open' as const),
    Promise.resolve().then(() => Promise.resolve().then(() => sentinel)),
  ]);
  return result === 'open';
};

describe('createTitlePersistenceGate', () => {
  it('starts shut', async () => {
    const gate = createTitlePersistenceGate();

    await expect(isOpen(gate.ready)).resolves.toBe(false);
  });

  it('opens when the write reports a persisted conversation', async () => {
    const gate = createTitlePersistenceGate();

    gate.openWhenConversationPersisted(
      Promise.resolve({ message: {}, conversation: { conversationId: 'convo-1' } }),
    );

    await expect(gate.ready).resolves.toBeUndefined();
  });

  it('stays shut when the write persisted no conversation', async () => {
    const gate = createTitlePersistenceGate();

    gate.openWhenConversationPersisted(Promise.resolve({ message: {} }));

    await expect(isOpen(gate.ready)).resolves.toBe(false);
  });

  it('stays shut when the write failed', async () => {
    const gate = createTitlePersistenceGate();

    gate.openWhenConversationPersisted(Promise.reject(new Error('write failed')));

    await expect(isOpen(gate.ready)).resolves.toBe(false);
  });

  it('stays shut while the write is still pending', async () => {
    const gate = createTitlePersistenceGate();
    let settle: (value: unknown) => void = () => {};
    gate.openWhenConversationPersisted(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    await expect(isOpen(gate.ready)).resolves.toBe(false);

    settle({ conversation: { conversationId: 'convo-1' } });

    await expect(gate.ready).resolves.toBeUndefined();
  });

  it('ignores a value that is not a promise', async () => {
    const gate = createTitlePersistenceGate();

    gate.openWhenConversationPersisted(undefined);
    gate.openWhenConversationPersisted({ conversation: { conversationId: 'convo-1' } });

    await expect(isOpen(gate.ready)).resolves.toBe(false);
  });

  it('opens unconditionally through open(), and open() stays idempotent', async () => {
    const gate = createTitlePersistenceGate();

    gate.open();
    gate.open();
    gate.openWhenConversationPersisted(Promise.resolve({ message: {} }));

    await expect(gate.ready).resolves.toBeUndefined();
  });
});
