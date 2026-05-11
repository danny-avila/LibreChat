const { Tools } = require('librechat-data-provider');

// Mock all dependencies before requiring the module
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-id'),
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  getMessageId: jest.fn(),
  ToolEndHandler: jest.fn(),
  handleToolCalls: jest.fn(),
}));

jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  /* `runPreviewFinalize` is the runtime pairing for `finalize` (defined
   * alongside processCodeOutput in process.js). The callback wires
   * the deferred render through it; reproduce the basic happy-path here so the
   * SSE-emit assertions still work. The catch/defensive-updateFile
   * branch is unit-tested directly against the real helper in
   * process.spec.js — exercising it here would add test coupling
   * without coverage benefit. */
  runPreviewFinalize: ({ finalize, onResolved }) => {
    if (typeof finalize !== 'function') {
      return;
    }
    finalize()
      .then((updated) => {
        if (!updated || !onResolved) {
          return;
        }
        onResolved(updated);
      })
      .catch(() => {
        /* swallowed in the mock — see process.spec.js for catch coverage */
      });
  },
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

describe('createToolEndCallback', () => {
  let req, res, artifactPromises, createToolEndCallback;
  let logger;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked logger
    logger = require('@librechat/data-schemas').logger;

    // Now require the module after all mocks are set up
    const callbacks = require('../callbacks');
    createToolEndCallback = callbacks.createToolEndCallback;

    req = {
      user: { id: 'user123' },
    };
    res = {
      headersSent: false,
      write: jest.fn(),
    };
    artifactPromises = [];
  });

  describe('ui_resources artifact handling', () => {
    it('should process ui_resources artifact and return attachment when headers not sent', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [
              { type: 'button', label: 'Click me' },
              { type: 'input', placeholder: 'Enter text' },
            ],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      // Wait for all promises to resolve
      const results = await Promise.all(artifactPromises);

      // When headers are not sent, it returns attachment without writing
      expect(res.write).not.toHaveBeenCalled();

      const attachment = results[0];
      expect(attachment).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [
          { type: 'button', label: 'Click me' },
          { type: 'input', placeholder: 'Enter text' },
        ],
      });
    });

    it('should write to response when headers are already sent', async () => {
      res.headersSent = true;
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'carousel', items: [] }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(res.write).toHaveBeenCalled();
      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [{ type: 'carousel', items: [] }],
      });
    });

    it('should handle errors when processing ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      // Mock res.write to throw an error
      res.headersSent = true;
      res.write.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'test' }],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing artifact content:',
        expect.any(Error),
      );
      expect(results[0]).toBeNull();
    });

    it('should handle multiple artifacts including ui_resources', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [{ type: 'chart', data: [] }],
          },
          [Tools.web_search]: {
            results: ['result1', 'result2'],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      // Both ui_resources and web_search should be processed
      expect(artifactPromises).toHaveLength(2);
      expect(results).toHaveLength(2);

      // Check ui_resources attachment
      const uiResourceAttachment = results.find((r) => r?.type === Tools.ui_resources);
      expect(uiResourceAttachment).toBeTruthy();
      expect(uiResourceAttachment[Tools.ui_resources]).toEqual([{ type: 'chart', data: [] }]);

      // Check web_search attachment
      const webSearchAttachment = results.find((r) => r?.type === Tools.web_search);
      expect(webSearchAttachment).toBeTruthy();
      expect(webSearchAttachment[Tools.web_search]).toEqual({
        results: ['result1', 'result2'],
      });
    });

    it('should not process artifacts when output has no artifacts', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        content: 'Some regular content',
        // No artifact property
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty ui_resources data object', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: [],
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0]).toEqual({
        type: Tools.ui_resources,
        messageId: 'run456',
        toolCallId: 'tool123',
        conversationId: 'thread789',
        [Tools.ui_resources]: [],
      });
    });

    it('should handle ui_resources with complex nested data', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const complexData = {
        0: {
          type: 'form',
          fields: [
            { name: 'field1', type: 'text', required: true },
            { name: 'field2', type: 'select', options: ['a', 'b', 'c'] },
          ],
          nested: {
            deep: {
              value: 123,
              array: [1, 2, 3],
            },
          },
        },
      };

      const output = {
        tool_call_id: 'tool123',
        artifact: {
          [Tools.ui_resources]: {
            data: complexData,
          },
        },
      };

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output }, metadata);
      const results = await Promise.all(artifactPromises);

      expect(results[0][Tools.ui_resources]).toEqual(complexData);
    });

    it('should handle when output is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback({ output: undefined }, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });

    it('should handle when data parameter is undefined', async () => {
      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });

      const metadata = {
        run_id: 'run456',
        thread_id: 'thread789',
      };

      await toolEndCallback(undefined, metadata);

      expect(artifactPromises).toHaveLength(0);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('code execution deferred-preview emit', () => {
    /* The deferred-preview code-execution flow emits the attachment twice over
     * SSE: the initial emit with `status: 'pending'` and the current run's
     * messageId, the deferred render with the resolved record. The preview update emit
     * must use the CURRENT run's messageId (not the persisted DB one)
     * because `processCodeOutput` intentionally preserves the original
     * `messageId` on cross-turn filename reuse — `getCodeGeneratedFiles`
     * needs that for prior-turn priming.
     *
     * Codex P1 review on PR #12957: shipping `updated.messageId`
     * straight from the DB record routed preview-update patches to the wrong
     * message slot, leaving the current turn's pending chip stuck. */

    const { processCodeOutput } = require('~/server/services/Files/Code/process');

    function makeCodeExecutionEvent({ runId, threadId, toolCallId, fileId, name }) {
      return {
        output: {
          name: 'execute_code',
          tool_call_id: toolCallId,
          artifact: {
            session_id: 'sess-1',
            files: [{ id: fileId, name, session_id: 'sess-1' }],
          },
        },
        metadata: { run_id: runId, thread_id: threadId },
      };
    }

    /** Parse the SSE frame `res.write` produces back to a payload object. */
    function parseSseAttachment(call) {
      const frame = call[0];
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      return JSON.parse(dataLine.slice('data: '.length));
    }

    it('the preview update emit uses the current run messageId, not the persisted DB messageId (cross-turn filename reuse)', async () => {
      /* Simulate turn-2 reusing `output.csv` from turn-1. The DB record
       * surfaced by `updateFile` carries the original `turn-1-msg`
       * messageId; the runtime emit must rewrite to `turn-2-msg`. */
      res.headersSent = true;
      const finalize = jest.fn().mockResolvedValue({
        file_id: 'fid-shared',
        filename: 'output.csv',
        filepath: '/uploads/output.csv',
        type: 'text/csv',
        conversationId: 'thread789',
        messageId: 'turn-1-original-msg', // persisted DB id (older turn)
        status: 'ready',
        text: '<table></table>',
        textFormat: 'html',
      });
      processCodeOutput.mockResolvedValue({
        file: {
          file_id: 'fid-shared',
          filename: 'output.csv',
          filepath: '/uploads/output.csv',
          type: 'text/csv',
          conversationId: 'thread789',
          messageId: 'turn-2-current-run', // runtime overlay (current turn)
          toolCallId: 'tool-2',
          status: 'pending',
          text: null,
          textFormat: null,
        },
        finalize,
      });

      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
      const event = makeCodeExecutionEvent({
        runId: 'turn-2-current-run',
        threadId: 'thread789',
        toolCallId: 'tool-2',
        fileId: 'fid-shared',
        name: 'output.csv',
      });
      await toolEndCallback({ output: event.output }, event.metadata);
      await Promise.all(artifactPromises);
      // Wait one more tick so the fire-and-forget finalize() chain settles.
      await new Promise((resolve) => setImmediate(resolve));

      // Two SSE writes: the initial emit (pending) and the deferred render (ready).
      expect(res.write).toHaveBeenCalledTimes(2);
      const phase1 = parseSseAttachment(res.write.mock.calls[0]);
      const phase2 = parseSseAttachment(res.write.mock.calls[1]);

      // Initial emit already used the runtime messageId (sourced from result.file).
      expect(phase1.messageId).toBe('turn-2-current-run');
      expect(phase1.status).toBe('pending');

      /* The preview update MUST also route to the current run's messageId so the
       * frontend's `useAttachmentHandler` upserts under the same
       * messageAttachmentsMap slot as the initial emit. Routing to
       * `turn-1-original-msg` would land the patch on a stale message
       * and leave turn-2's pending chip stuck. */
      expect(phase2.messageId).toBe('turn-2-current-run');
      expect(phase2.file_id).toBe('fid-shared');
      expect(phase2.status).toBe('ready');
      expect(phase2.text).toBe('<table></table>');
      expect(phase2.toolCallId).toBe('tool-2');
      /* Wire-shape parity with the initial emit: preview update emits the full updated
       * record so the client doesn't see one shape on the initial emit and a
       * narrower projection on the deferred render. (Codex audit on PR #12957
       * Finding 1.) */
      expect(phase2.filename).toBe('output.csv');
      expect(phase2.filepath).toBe('/uploads/output.csv');
      expect(phase2.type).toBe('text/csv');
      expect(phase2.conversationId).toBe('thread789');
      expect(phase2.textFormat).toBe('html');
    });

    it('the preview update emit is skipped when finalize resolves to null (no DB update happened)', async () => {
      res.headersSent = true;
      processCodeOutput.mockResolvedValue({
        file: {
          file_id: 'fid-1',
          filename: 'data.xlsx',
          filepath: '/uploads/data.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          messageId: 'run-1',
          toolCallId: 'tool-1',
          status: 'pending',
        },
        finalize: jest.fn().mockResolvedValue(null),
      });

      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
      const event = makeCodeExecutionEvent({
        runId: 'run-1',
        threadId: 'thread-1',
        toolCallId: 'tool-1',
        fileId: 'fid-1',
        name: 'data.xlsx',
      });
      await toolEndCallback({ output: event.output }, event.metadata);
      await Promise.all(artifactPromises);
      await new Promise((resolve) => setImmediate(resolve));

      // Only the initial emit fired; preview update noop'd because finalize returned null.
      expect(res.write).toHaveBeenCalledTimes(1);
    });

    it('the preview update emit is skipped when the response stream has already closed', async () => {
      res.headersSent = true;
      /* Hand-rolled deferred so we can hold finalize() open until
       * AFTER setting `res.writableEnded = true`. Otherwise the mock
       * resolves synchronously, the .then() runs in the same microtask
       * queue as the artifactPromises await, and writableEnded is set
       * too late. */
      let resolveFinalize;
      const finalizeDeferred = new Promise((resolve) => {
        resolveFinalize = resolve;
      });
      processCodeOutput.mockResolvedValue({
        file: {
          file_id: 'fid-1',
          filename: 'data.xlsx',
          filepath: '/uploads/data.xlsx',
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          messageId: 'run-1',
          toolCallId: 'tool-1',
          status: 'pending',
        },
        finalize: jest.fn().mockReturnValue(finalizeDeferred),
      });

      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
      const event = makeCodeExecutionEvent({
        runId: 'run-1',
        threadId: 'thread-1',
        toolCallId: 'tool-1',
        fileId: 'fid-1',
        name: 'data.xlsx',
      });
      await toolEndCallback({ output: event.output }, event.metadata);
      await Promise.all(artifactPromises);
      // Simulate the response closing AFTER the initial emit fires but BEFORE
      // the deferred render lands. The frontend's polling path will catch the
      // resolved record on its next tick.
      res.writableEnded = true;
      // Now resolve finalize and let the .then() chain run.
      resolveFinalize({
        file_id: 'fid-1',
        filename: 'data.xlsx',
        messageId: 'run-1',
        status: 'ready',
        text: '<x/>',
        textFormat: 'html',
      });
      await new Promise((resolve) => setImmediate(resolve));

      // Initial emit wrote; preview update noop'd because writableEnded.
      expect(res.write).toHaveBeenCalledTimes(1);
    });

    it('does not call finalize for a non-office file (no preview expected)', async () => {
      res.headersSent = true;
      processCodeOutput.mockResolvedValue({
        file: {
          file_id: 'fid-txt',
          filename: 'note.txt',
          filepath: '/uploads/note.txt',
          type: 'text/plain',
          messageId: 'run-1',
          toolCallId: 'tool-1',
          // No status — non-office files skip the deferred render entirely.
        },
        // No finalize key — caller should not call anything.
      });

      const toolEndCallback = createToolEndCallback({ req, res, artifactPromises });
      const event = makeCodeExecutionEvent({
        runId: 'run-1',
        threadId: 'thread-1',
        toolCallId: 'tool-1',
        fileId: 'fid-txt',
        name: 'note.txt',
      });
      await toolEndCallback({ output: event.output }, event.metadata);
      await Promise.all(artifactPromises);
      await new Promise((resolve) => setImmediate(resolve));

      expect(res.write).toHaveBeenCalledTimes(1);
    });
  });
});

describe('isStreamWritable', () => {
  /* Direct parametric coverage of the predicate that gates SSE writes
   * in both the chat-completions and Open Responses callbacks. The
   * existing deferred-preview tests cover this indirectly via the
   * `writeAttachmentUpdate` writableEnded path; these tests pin down
   * each individual branch so a future modification (e.g. adding a
   * new condition) can't silently regress.
   * (Comprehensive review NIT on PR #12957.) */
  const { isStreamWritable } = require('../callbacks');

  it('returns true when streamId is truthy regardless of res state', () => {
    /* Resumable mode writes go to the job emitter; res state is
     * irrelevant. Even a closed res with no headers should not block. */
    expect(isStreamWritable(null, 'stream-1')).toBe(true);
    expect(isStreamWritable({ headersSent: false, writableEnded: true }, 'stream-1')).toBe(true);
    expect(isStreamWritable(undefined, 'stream-1')).toBe(true);
  });

  it('returns false when streamId is falsy and res is null/undefined', () => {
    expect(isStreamWritable(null, null)).toBe(false);
    expect(isStreamWritable(undefined, null)).toBe(false);
  });

  it('returns false when headers have not been sent yet', () => {
    expect(isStreamWritable({ headersSent: false, writableEnded: false }, null)).toBe(false);
  });

  it('returns false when the stream has already ended', () => {
    expect(isStreamWritable({ headersSent: true, writableEnded: true }, null)).toBe(false);
  });

  it('returns true on the happy path: headers sent, not ended, no streamId', () => {
    expect(isStreamWritable({ headersSent: true, writableEnded: false }, null)).toBe(true);
  });
});
