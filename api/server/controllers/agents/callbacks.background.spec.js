jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));
jest.mock('~/server/services/Files/Citations', () => ({ processFileCitations: jest.fn() }));
jest.mock('~/server/services/Files/process', () => ({ saveBase64Image: jest.fn() }));

const { processCodeOutput, runPreviewFinalize } = require('~/server/services/Files/Code/process');
const { createBackgroundCodeResultHandler } = require('./callbacks');

const req = { user: { id: 'user-1' } };

const baseParams = {
  toolName: 'execute_code',
  toolCallId: 'call_code',
  messageId: 'msg-dispatch',
  conversationId: 'convo-1',
  output: 'stdout:\nhello',
  artifact: {
    session_id: 'exec-sess',
    files: [
      { id: 'f1', name: 'plot.png', storage_session_id: 'store-1' },
      { id: 'f2', name: 'input.csv', inherited: true },
    ],
  },
};

describe('createBackgroundCodeResultHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists non-inherited files with the original identity and patches the message row', async () => {
    processCodeOutput.mockResolvedValue({
      file: { file_id: 'f1', filename: 'plot.png', toolCallId: 'call_code' },
      finalize: undefined,
    });
    const updateToolCallResult = jest.fn().mockResolvedValue(true);
    const handler = createBackgroundCodeResultHandler({ req, updateToolCallResult });

    const result = await handler(baseParams);

    expect(processCodeOutput).toHaveBeenCalledTimes(1);
    expect(processCodeOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        id: 'f1',
        name: 'plot.png',
        messageId: 'msg-dispatch',
        toolCallId: 'call_code',
        conversationId: 'convo-1',
        session_id: 'store-1',
        freshClaimAfter: expect.any(Number),
      }),
    );
    expect(updateToolCallResult).toHaveBeenCalledTimes(1);
    expect(updateToolCallResult).toHaveBeenCalledWith({
      userId: 'user-1',
      messageId: 'msg-dispatch',
      conversationId: 'convo-1',
      toolCallId: 'call_code',
      output: 'stdout:\nhello',
      attachments: [{ file_id: 'f1', filename: 'plot.png', toolCallId: 'call_code' }],
    });
    expect(result).toEqual({
      attachments: [{ file_id: 'f1', filename: 'plot.png', toolCallId: 'call_code' }],
    });
  });

  it('runs deferred preview finalization without a live stream callback', async () => {
    const finalize = jest.fn();
    processCodeOutput.mockResolvedValue({
      file: { file_id: 'f1' },
      finalize,
      previewRevision: 3,
    });
    const handler = createBackgroundCodeResultHandler({
      req,
      updateToolCallResult: jest.fn().mockResolvedValue(true),
    });

    await handler(baseParams);

    expect(runPreviewFinalize).toHaveBeenCalledWith({ finalize, fileId: 'f1', previewRevision: 3 });
  });

  it('retries the row patch until the dispatch turn persists', async () => {
    jest.useFakeTimers();
    try {
      processCodeOutput.mockResolvedValue({ file: { file_id: 'f1' } });
      const updateToolCallResult = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      const handler = createBackgroundCodeResultHandler({ req, updateToolCallResult });

      const promise = handler(baseParams);
      await jest.advanceTimersByTimeAsync(250);
      await jest.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(updateToolCallResult).toHaveBeenCalledTimes(3);
      expect(result?.attachments).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still patches output when a file download fails (files are best-effort)', async () => {
    processCodeOutput.mockRejectedValue(new Error('download failed'));
    const updateToolCallResult = jest.fn().mockResolvedValue(true);
    const handler = createBackgroundCodeResultHandler({ req, updateToolCallResult });

    const result = await handler(baseParams);

    expect(updateToolCallResult).toHaveBeenCalledWith(
      expect.objectContaining({ output: 'stdout:\nhello', attachments: [] }),
    );
    expect(result).toEqual({ attachments: [] });
  });

  it('reapply mode re-applies the row patch without reprocessing files', async () => {
    const updateToolCallResult = jest.fn().mockResolvedValue(true);
    const handler = createBackgroundCodeResultHandler({ req, updateToolCallResult });

    const result = await handler({
      ...baseParams,
      artifact: undefined,
      attachments: [{ file_id: 'f1' }],
      reapply: true,
    });

    expect(processCodeOutput).not.toHaveBeenCalled();
    expect(updateToolCallResult).toHaveBeenCalledTimes(1);
    expect(updateToolCallResult).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg-dispatch',
        toolCallId: 'call_code',
        output: 'stdout:\nhello',
        attachments: [{ file_id: 'f1' }],
      }),
    );
    expect(result).toEqual({ attachments: [{ file_id: 'f1' }] });
  });

  it('returns null without identity to anchor to', async () => {
    const updateToolCallResult = jest.fn();
    const handler = createBackgroundCodeResultHandler({ req, updateToolCallResult });
    expect(await handler({ ...baseParams, messageId: undefined })).toBeNull();
    expect(updateToolCallResult).not.toHaveBeenCalled();
  });
});
