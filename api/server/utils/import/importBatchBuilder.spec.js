const { ImportBatchBuilder } = require('./importBatchBuilder');

jest.mock('~/models', () => ({
  bulkSaveConvos: jest.fn().mockResolvedValue(undefined),
  bulkSaveMessages: jest.fn().mockResolvedValue(undefined),
  bulkIncrementTagCounts: jest.fn().mockResolvedValue(undefined),
}));

const { bulkSaveConvos, bulkSaveMessages } = require('~/models');

describe('ImportBatchBuilder flushing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
