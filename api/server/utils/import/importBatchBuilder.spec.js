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

const { bulkSaveConvos, bulkSaveMessages, getConvosQueried, deleteMessages } = require('~/models');

describe('ImportBatchBuilder flushing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  /** Messages go in first, so a failed conversation write leaves rows nothing
   * points at. A retry mints fresh message ids, so they are never reused and
   * would otherwise pile up on every re-import. */
  it('removes the messages it wrote when the conversation write fails', async () => {
    bulkSaveConvos.mockRejectedValueOnce(new Error('conversation write failed'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    const message = builder.addUserMessage('hello');
    builder.finishConversation('Chat', new Date());

    await expect(builder.saveBatch()).rejects.toThrow('conversation write failed');

    expect(deleteMessages).toHaveBeenCalledWith({
      user: 'u1',
      messageId: { $in: [message.messageId] },
    });
  });

  it('keeps messages whose conversation committed before an ambiguous write failure', async () => {
    bulkSaveConvos.mockRejectedValueOnce(new Error('conversation write outcome unknown'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    const committedMessage = builder.addUserMessage('committed');
    const { conversation: committed } = builder.finishConversation('Committed', new Date());
    builder.startConversation();
    const orphanedMessage = builder.addUserMessage('orphaned');
    const { conversation: orphaned } = builder.finishConversation('Orphaned', new Date());
    getConvosQueried.mockResolvedValueOnce({
      conversations: [committed],
      nextCursor: null,
      convoMap: { [committed.conversationId]: committed },
    });

    await expect(builder.saveBatch()).rejects.toThrow('conversation write outcome unknown');

    expect(getConvosQueried).toHaveBeenCalledWith(
      'u1',
      [{ conversationId: committed.conversationId }, { conversationId: orphaned.conversationId }],
      null,
      2,
    );
    expect(deleteMessages).toHaveBeenCalledWith({
      user: 'u1',
      messageId: { $in: [orphanedMessage.messageId] },
    });
    expect(deleteMessages.mock.calls[0][0].messageId.$in).not.toContain(committedMessage.messageId);
  });

  it('deletes no messages when every conversation committed before the write rejected', async () => {
    bulkSaveConvos.mockRejectedValueOnce(new Error('write concern timeout'));

    const builder = new ImportBatchBuilder('u1', undefined, { flushThreshold: 5 });
    builder.startConversation();
    builder.addUserMessage('hello');
    const { conversation } = builder.finishConversation('Committed', new Date());
    getConvosQueried.mockResolvedValueOnce({
      conversations: [conversation],
      nextCursor: null,
      convoMap: { [conversation.conversationId]: conversation },
    });

    await expect(builder.saveBatch()).rejects.toThrow('write concern timeout');

    expect(deleteMessages).not.toHaveBeenCalled();
  });
});
