const { createImportBatchBuilder } = require('./importBatchBuilder');
const { enqueueSearchEvents, bulkSaveConvos, bulkSaveMessages } = require('~/models');

jest.mock('~/models', () => ({
  bulkSaveConvos: jest.fn().mockResolvedValue(undefined),
  bulkSaveMessages: jest.fn().mockResolvedValue(undefined),
  bulkIncrementTagCounts: jest.fn().mockResolvedValue(undefined),
  enqueueSearchEvents: jest.fn().mockResolvedValue(0),
}));

const USER_ID = 'user-1';

function buildBatch() {
  const builder = createImportBatchBuilder(USER_ID);
  builder.startConversation('openAI');
  builder.saveMessage({ text: 'first', sender: 'user', isCreatedByUser: true });
  builder.saveMessage({ text: 'second', sender: 'assistant', isCreatedByUser: false });
  builder.finishConversation('Imported chat', new Date('2026-01-01T00:00:00Z'));
  return builder;
}

describe('ImportBatchBuilder projection events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enqueues an upsert for every imported conversation and message', async () => {
    const builder = buildBatch();
    await builder.saveBatch();

    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);
    expect(enqueueSearchEvents).toHaveBeenCalledTimes(1);

    const events = enqueueSearchEvents.mock.calls[0][0];
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.op === 'upsert')).toBe(true);
    expect(events.every((event) => event.userId === USER_ID)).toBe(true);
    expect(events.filter((event) => event.kind === 'conversation')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'message')).toHaveLength(2);
  });

  it('carries every record id so the projector can key the row without a scan', async () => {
    const builder = buildBatch();
    await builder.saveBatch();

    const events = enqueueSearchEvents.mock.calls[0][0];
    expect(events.every((event) => typeof event.recordId === 'string' && event.recordId)).toBe(
      true,
    );
  });

  it('does not fail the import when the projection queue is unavailable', async () => {
    enqueueSearchEvents.mockRejectedValueOnce(new Error('queue down'));
    const builder = buildBatch();

    await expect(builder.saveBatch()).resolves.toBeUndefined();
    expect(bulkSaveConvos).toHaveBeenCalledTimes(1);
  });
});
