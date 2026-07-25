import type { ServerRequest } from '~/types';
import { createBackgroundCodeResultHandler } from './harvest';

const req = {
  user: { id: 'user-1' },
} as ServerRequest;

const params = {
  toolName: 'execute_code',
  toolCallId: 'tool-call-1',
  messageId: 'message-1',
  conversationId: 'conversation-1',
  output: 'safe output',
  artifact: {
    session_id: 'artifact-session',
    files: [{ id: 'file-1', name: 'output.txt', storage_session_id: 'storage-session' }],
  },
};

describe('createBackgroundCodeResultHandler generated-file preflight', () => {
  it('persists prepared entries only after the complete batch preflight passes', async () => {
    const preparedBuffer = Buffer.from('safe');
    const preflightCodeOutputBatch = jest.fn().mockResolvedValue([
      {
        file: params.artifact.files[0],
        sessionId: 'storage-session',
        preparedBuffer,
      },
    ]);
    const processCodeOutput = jest.fn().mockResolvedValue({
      file: { file_id: 'persisted-file' },
    });
    const updateToolCallResult = jest.fn().mockResolvedValue({ matched: true, unfinished: false });
    const runPreviewFinalize = jest.fn();
    const handler = createBackgroundCodeResultHandler({
      req,
      preflightCodeOutputBatch,
      processCodeOutput,
      updateToolCallResult,
      runPreviewFinalize,
    });

    await expect(handler(params)).resolves.toEqual({
      attachments: [{ file_id: 'persisted-file' }],
    });

    expect(preflightCodeOutputBatch).toHaveBeenCalledWith({
      req,
      artifact: params.artifact,
    });
    expect(processCodeOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        id: 'file-1',
        name: 'output.txt',
        session_id: 'storage-session',
        preparedBuffer,
      }),
    );
    expect(preflightCodeOutputBatch.mock.invocationCallOrder[0]).toBeLessThan(
      processCodeOutput.mock.invocationCallOrder[0],
    );
    expect(updateToolCallResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: 'safe output',
        attachments: [{ file_id: 'persisted-file' }],
      }),
    );
  });

  it('propagates a blocked batch before persistence or tool-result update', async () => {
    const blocked = new Error('generated content blocked');
    const preflightCodeOutputBatch = jest.fn().mockRejectedValue(blocked);
    const processCodeOutput = jest.fn();
    const updateToolCallResult = jest.fn();
    const handler = createBackgroundCodeResultHandler({
      req,
      preflightCodeOutputBatch,
      processCodeOutput,
      updateToolCallResult,
      runPreviewFinalize: jest.fn(),
    });

    await expect(handler(params)).rejects.toBe(blocked);

    expect(processCodeOutput).not.toHaveBeenCalled();
    expect(updateToolCallResult).not.toHaveBeenCalled();
  });
});
