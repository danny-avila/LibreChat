const { ImportBatchBuilder } = require('./importBatchBuilder');

jest.mock('~/models', () => ({
  bulkSaveConvos: jest.fn().mockResolvedValue(undefined),
  bulkSaveMessages: jest.fn().mockResolvedValue(undefined),
  bulkIncrementTagCounts: jest.fn().mockResolvedValue(undefined),
  getConvosQueried: jest
    .fn()
    .mockResolvedValue({ conversations: [], nextCursor: null, convoMap: {} }),
  deleteMessages: jest.fn().mockResolvedValue({ deletedCount: 0 }),
}));

const {
  bulkSaveConvos,
  bulkSaveMessages,
  bulkIncrementTagCounts,
  getConvosQueried,
  deleteMessages,
} = require('~/models');

describe('ImportBatchBuilder flushing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bulkSaveMessages.mockResolvedValue(undefined);
    bulkSaveConvos.mockResolvedValue(undefined);
    bulkIncrementTagCounts.mockResolvedValue(undefined);
    getConvosQueried.mockResolvedValue({ conversations: [], nextCursor: null, convoMap: {} });
  });

  it('flushes once the threshold is reached and clears the buffer', async () => {
    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 2 });

    for (let i = 0; i < 2; i++) {
      builder.startConversation();
      builder.addUserMessage(`hello ${i}`);
      builder.finishConversation(`Chat ${i}`, new Date());
      await builder.maybeFlush();
    }

    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
    expect(bulkSaveConvos.mock.calls[0][0]).toHaveLength(2);
    expect(builder.conversations).toHaveLength(0);
    expect(builder.messages).toHaveLength(0);
  });

  it('does not flush before the threshold', async () => {
    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });

    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());
    await builder.maybeFlush();

    expect(bulkSaveConvos).not.toHaveBeenCalled();
    expect(builder.conversations).toHaveLength(1);
  });

  it('saveBatch writes the remainder', async () => {
    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });

    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());
    await builder.saveBatch();

    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
    expect(builder.conversations).toHaveLength(0);
  });

  it('saveBatch is a no-op when nothing is buffered', async () => {
    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    await builder.saveBatch();
    expect(bulkSaveConvos).not.toHaveBeenCalled();
  });

  it('writes messages before conversations, so the conversation acts as a commit marker', async () => {
    const order = [];
    bulkSaveMessages.mockImplementation(async () => {
      order.push('messages');
    });
    bulkSaveConvos.mockImplementation(async () => {
      order.push('conversations');
    });

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());
    await builder.saveBatch();

    expect(order).toEqual(['messages', 'conversations']);
  });

  it('never writes conversations when the message write fails', async () => {
    bulkSaveMessages.mockRejectedValueOnce(new Error('message write failed'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());

    await expect(builder.saveBatch()).rejects.toThrow('message write failed');

    expect(bulkSaveConvos).not.toHaveBeenCalled();
  });

  /** Messages go in first, so a message write that fails before any
   * conversation write leaves rows nothing points at. A retry mints fresh
   * message ids, so they are never reused and would otherwise pile up on every
   * re-import. This is the one window in which the conversation write is known
   * not to have started, so it is the one window cleanup may run in. */
  it('removes the messages it wrote when the message write fails', async () => {
    const error = new Error('message write failed');
    bulkSaveMessages.mockRejectedValueOnce(error);

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    const message = builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());

    await expect(builder.saveBatch()).rejects.toBe(error);

    expect(builder.getLastFlushOutcome()).toBe('not_committed');
    expect(bulkSaveConvos).not.toHaveBeenCalled();
    expect(deleteMessages).toHaveBeenCalledWith({
      user: 'u1',
      messageId: { $in: [message.messageId] },
    });
  });

  /** A bulk write can commit and still reject: a write concern timeout, a
   * dropped response, a partially applied batch. Deleting the messages on that
   * rejection turns a committed conversation into a permanently empty one. */
  it('keeps every message when the conversation write rejects ambiguously', async () => {
    const error = new Error('conversation write outcome unknown');
    bulkSaveConvos.mockRejectedValueOnce(error);

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('first');
    builder.finishConversation('First', new Date());
    builder.startConversation();
    builder.addUserMessage('second');
    builder.finishConversation('Second', new Date());

    await expect(builder.saveBatch()).rejects.toBe(error);

    expect(builder.getLastFlushOutcome()).toBe('ambiguous');
    expect(deleteMessages).not.toHaveBeenCalled();
  });

  /** Retention-aware readers apply `getVisibleConversationRetentionFilter`,
   * which hides the temporary and expired conversations an import creates, so
   * a committed conversation reads back as absent and its messages look
   * orphaned. No existence probe may gate the cleanup. */
  it('never probes for the conversations it wrote', async () => {
    bulkSaveConvos.mockRejectedValueOnce(new Error('conversation write outcome unknown'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Temporary', new Date());

    await expect(builder.saveBatch()).rejects.toThrow('conversation write outcome unknown');

    expect(getConvosQueried).not.toHaveBeenCalled();
    expect(deleteMessages).not.toHaveBeenCalled();
  });

  /** Tag maintenance only runs once the commit markers exist, so its failure
   * proves the conversations were written. */
  it('keeps every message when tag maintenance fails after the conversations committed', async () => {
    bulkIncrementTagCounts.mockRejectedValueOnce(new Error('tag write failed'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());

    await expect(builder.saveBatch()).rejects.toThrow('tag write failed');

    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
    expect(deleteMessages).not.toHaveBeenCalled();
  });
});

describe('ImportBatchBuilder importedFrom marker', () => {
  const finish = (externalId) => {
    const builder = new ImportBatchBuilder('u1');
    builder.startConversation();
    builder.addUserMessage('hello');
    const { conversation } = builder.finishConversation('Chat', new Date(), {
      importedFrom: { source: 'chatgpt', externalId },
    });
    return conversation;
  };

  it('keeps the marker when the export carries a usable id', () => {
    expect(finish('abc-123').importedFrom).toEqual({ source: 'chatgpt', externalId: 'abc-123' });
  });

  /** `convoSchema` declares `importedFrom.externalId` required, and every
   * import write goes through `bulkSaveConvos`, whose `updateOne` upserts run
   * no validators. A marker built from an id-less export therefore reached the
   * database as an invalid subdocument instead of being rejected. */
  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['not a string', 42],
  ])('drops the marker when the id is %s', (_label, externalId) => {
    const conversation = finish(externalId);

    expect(conversation.importedFrom).toBeUndefined();
    expect('importedFrom' in conversation).toBe(false);
  });

  it('leaves a conversation with no marker alone', () => {
    const builder = new ImportBatchBuilder('u1');
    builder.startConversation();
    builder.addUserMessage('hello');
    const { conversation } = builder.finishConversation('Chat', new Date());

    expect('importedFrom' in conversation).toBe(false);
  });
});
