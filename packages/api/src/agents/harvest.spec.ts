import type { ServerRequest } from '~/types';
import { createBackgroundCodeResultHandler, createBackgroundToolResultHandler } from './harvest';

const req = {
  user: { id: 'user-1' },
} as ServerRequest;

const params = {
  toolName: 'execute_code',
  toolCallId: 'tool-call-1',
  stepId: 'step-1',
  messageId: 'message-1',
  conversationId: 'conversation-1',
  output: 'safe output',
  artifact: {
    session_id: 'artifact-session',
    files: [{ id: 'file-1', name: 'output.txt', storage_session_id: 'storage-session' }],
  },
  codeExecutionContext: {
    baseUrl: 'https://code-stateful.example.com',
    codeSessionKey: 'execute_code:stateful:test',
    executionProfile: 'stateful' as const,
    executionRouteKey: `stateful:${'a'.repeat(32)}`,
    statefulSessions: true,
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
      attachments: [{ file_id: 'persisted-file', stepId: 'step-1' }],
    });

    expect(preflightCodeOutputBatch).toHaveBeenCalledWith({
      req,
      artifact: params.artifact,
      codeExecutionContext: params.codeExecutionContext,
    });
    expect(processCodeOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        id: 'file-1',
        name: 'output.txt',
        session_id: 'storage-session',
        codeApiBaseUrl: 'https://code-stateful.example.com',
        executionProfile: 'stateful',
        executionRouteKey: `stateful:${'a'.repeat(32)}`,
        preparedBuffer,
      }),
    );
    expect(preflightCodeOutputBatch.mock.invocationCallOrder[0]).toBeLessThan(
      processCodeOutput.mock.invocationCallOrder[0],
    );
    expect(updateToolCallResult).toHaveBeenCalledWith(
      expect.objectContaining({
        output: 'safe output',
        stepId: 'step-1',
        attachments: [{ file_id: 'persisted-file', stepId: 'step-1' }],
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

describe('createBackgroundToolResultHandler claim ownership', () => {
  it('re-reads a same-generation manual claim before each persistence retry', async () => {
    let claimed = false;
    const updateToolCallResult = jest
      .fn()
      .mockImplementationOnce(async () => {
        claimed = true;
        return { matched: false, unfinished: false };
      })
      .mockResolvedValueOnce({ matched: true, unfinished: false });
    const handler = createBackgroundToolResultHandler({ req, updateToolCallResult });
    const baseState = {
      taskId: 'task-1',
      toolName: 'slow_tool',
      status: 'completed' as const,
      settledAt: new Date('2026-08-30T00:00:00Z'),
    };

    await expect(
      handler({
        toolName: 'slow_tool',
        toolCallId: 'call-1',
        stepId: 'step-1',
        messageId: 'message-1',
        conversationId: 'conversation-1',
        output: 'done',
        backgroundTask: baseState,
        resolveBackgroundTask: () => ({
          ...baseState,
          ...(claimed
            ? {
                resultClaim: {
                  kind: 'manual' as const,
                  claimId: 'poll-1',
                  claimedAt: new Date('2026-08-30T00:00:01Z'),
                },
              }
            : {}),
        }),
      }),
    ).resolves.toBe(true);

    expect(updateToolCallResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        backgroundTask: expect.objectContaining({
          resultClaim: expect.objectContaining({ kind: 'manual', claimId: 'poll-1' }),
        }),
      }),
    );
  });
});
