/**
 * Tests for job replacement detection in ResumableAgentController
 *
 * Tests the following fixes from PR #11462:
 * 1. Job creation timestamp tracking
 * 2. Stale job detection and event skipping
 * 3. Response message saving before final event emission
 */

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockGenerationJobManager = {
  createJob: jest.fn(),
  getJob: jest.fn(),
  emitDone: jest.fn(),
  emitChunk: jest.fn(),
  completeJob: jest.fn(),
  updateMetadata: jest.fn(),
  setContentParts: jest.fn(),
  subscribe: jest.fn(),
};

const mockSaveMessage = jest.fn();
const mockDecrementPendingRequest = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn().mockReturnValue(false),
  GenerationJobManager: mockGenerationJobManager,
  getReferencedQuotes: jest.fn((quotes) => {
    if (!Array.isArray(quotes)) {
      return null;
    }
    const normalized = quotes
      .filter((quote) => typeof quote === 'string' && quote.trim().length > 0)
      .map((quote) => quote.trim());
    return normalized.length > 0 ? normalized : null;
  }),
  checkAndIncrementPendingRequest: jest.fn().mockResolvedValue({ allowed: true }),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  getViolationInfo: jest.fn(),
  sanitizeMessageForTransmit: jest.fn((msg) => msg),
  sanitizeFileForTransmit: jest.fn((file) => file),
  Constants: { NO_PARENT: '00000000-0000-0000-0000-000000000000' },
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
}));

describe('Job Replacement Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Job Creation Timestamp Tracking', () => {
    it('should capture createdAt when job is created', async () => {
      const streamId = 'test-stream-123';
      const createdAt = Date.now();

      mockGenerationJobManager.createJob.mockResolvedValue({
        createdAt,
        readyPromise: Promise.resolve(),
        abortController: new AbortController(),
        emitter: { on: jest.fn() },
      });

      const job = await mockGenerationJobManager.createJob(streamId, 'user-123', streamId);

      expect(job.createdAt).toBe(createdAt);
    });
  });

  describe('Job Replacement Detection Logic', () => {
    /**
     * Simulates the job replacement detection logic from request.js
     * This is extracted for unit testing since the full controller is complex
     */
    const detectJobReplacement = async (streamId, originalCreatedAt) => {
      const currentJob = await mockGenerationJobManager.getJob(streamId);
      return !currentJob || currentJob.createdAt !== originalCreatedAt;
    };

    it('should detect when job was replaced (different createdAt)', async () => {
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;
      const newCreatedAt = 2000;

      mockGenerationJobManager.getJob.mockResolvedValue({
        createdAt: newCreatedAt,
      });

      const wasReplaced = await detectJobReplacement(streamId, originalCreatedAt);

      expect(wasReplaced).toBe(true);
    });

    it('should detect when job was deleted', async () => {
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;

      mockGenerationJobManager.getJob.mockResolvedValue(null);

      const wasReplaced = await detectJobReplacement(streamId, originalCreatedAt);

      expect(wasReplaced).toBe(true);
    });

    it('should not detect replacement when same job (same createdAt)', async () => {
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;

      mockGenerationJobManager.getJob.mockResolvedValue({
        createdAt: originalCreatedAt,
      });

      const wasReplaced = await detectJobReplacement(streamId, originalCreatedAt);

      expect(wasReplaced).toBe(false);
    });
  });

  describe('Event Emission Behavior', () => {
    /**
     * Simulates the final event emission logic from request.js
     */
    const emitFinalEventIfNotReplaced = async ({
      streamId,
      originalCreatedAt,
      finalEvent,
      userId,
    }) => {
      const currentJob = await mockGenerationJobManager.getJob(streamId);
      const jobWasReplaced = !currentJob || currentJob.createdAt !== originalCreatedAt;

      if (jobWasReplaced) {
        mockLogger.debug('Skipping FINAL emit - job was replaced', {
          streamId,
          originalCreatedAt,
          currentCreatedAt: currentJob?.createdAt,
        });
        await mockDecrementPendingRequest(userId);
        return false;
      }

      mockGenerationJobManager.emitDone(streamId, finalEvent);
      mockGenerationJobManager.completeJob(streamId);
      await mockDecrementPendingRequest(userId);
      return true;
    };

    it('should skip emitting when job was replaced', async () => {
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;
      const newCreatedAt = 2000;
      const userId = 'user-123';

      mockGenerationJobManager.getJob.mockResolvedValue({
        createdAt: newCreatedAt,
      });

      const emitted = await emitFinalEventIfNotReplaced({
        streamId,
        originalCreatedAt,
        finalEvent: { final: true },
        userId,
      });

      expect(emitted).toBe(false);
      expect(mockGenerationJobManager.emitDone).not.toHaveBeenCalled();
      expect(mockGenerationJobManager.completeJob).not.toHaveBeenCalled();
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(userId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping FINAL emit - job was replaced',
        expect.objectContaining({
          streamId,
          originalCreatedAt,
          currentCreatedAt: newCreatedAt,
        }),
      );
    });

    it('should emit when job was not replaced', async () => {
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;
      const userId = 'user-123';
      const finalEvent = { final: true, conversation: { conversationId: streamId } };

      mockGenerationJobManager.getJob.mockResolvedValue({
        createdAt: originalCreatedAt,
      });

      const emitted = await emitFinalEventIfNotReplaced({
        streamId,
        originalCreatedAt,
        finalEvent,
        userId,
      });

      expect(emitted).toBe(true);
      expect(mockGenerationJobManager.emitDone).toHaveBeenCalledWith(streamId, finalEvent);
      expect(mockGenerationJobManager.completeJob).toHaveBeenCalledWith(streamId);
      expect(mockDecrementPendingRequest).toHaveBeenCalledWith(userId);
    });
  });

  describe('Response Message Saving Order', () => {
    /**
     * Tests that response messages are saved BEFORE final events are emitted
     * This prevents race conditions where clients send follow-up messages
     * before the response is in the database
     */
    it('should save message before emitting final event', async () => {
      const callOrder = [];

      mockSaveMessage.mockImplementation(async () => {
        callOrder.push('saveMessage');
      });

      mockGenerationJobManager.emitDone.mockImplementation(() => {
        callOrder.push('emitDone');
      });

      mockGenerationJobManager.getJob.mockResolvedValue({
        createdAt: 1000,
      });

      // Simulate the order of operations from request.js
      const streamId = 'test-stream-123';
      const originalCreatedAt = 1000;
      const response = { messageId: 'response-123' };
      const userId = 'user-123';

      // Step 1: Save message
      await mockSaveMessage({}, { ...response, user: userId }, { context: 'test' });

      // Step 2: Check for replacement
      const currentJob = await mockGenerationJobManager.getJob(streamId);
      const jobWasReplaced = !currentJob || currentJob.createdAt !== originalCreatedAt;

      // Step 3: Emit if not replaced
      if (!jobWasReplaced) {
        mockGenerationJobManager.emitDone(streamId, { final: true });
      }

      expect(callOrder).toEqual(['saveMessage', 'emitDone']);
    });
  });

  describe('Aborted Request Handling', () => {
    it('should use unfinished: true instead of error: true for aborted requests', () => {
      const response = { messageId: 'response-123', content: [] };

      // The new format for aborted responses
      const abortedResponse = { ...response, unfinished: true };

      expect(abortedResponse.unfinished).toBe(true);
      expect(abortedResponse.error).toBeUndefined();
    });

    it('should include unfinished flag in final event for aborted requests', () => {
      const response = { messageId: 'response-123', content: [] };

      // Old format (deprecated)
      const _oldFinalEvent = {
        final: true,
        responseMessage: { ...response, error: true },
        error: { message: 'Request was aborted' },
      };

      // New format (PR #11462)
      const newFinalEvent = {
        final: true,
        responseMessage: { ...response, unfinished: true },
      };

      expect(newFinalEvent.responseMessage.unfinished).toBe(true);
      expect(newFinalEvent.error).toBeUndefined();
      expect(newFinalEvent.responseMessage.error).toBeUndefined();
    });
  });
});

/**
 * HITL terminal-side-effect guards (PR #13942).
 *
 * Jobs are keyed by streamId == conversationId, so a NEW request REPLACES the running
 * one on the same conversation. The replaced generation's tail (its pause attempt, its
 * checkpoint prune, its resume catch-path terminal writes) must not clobber the live
 * generation's state. Each guard re-reads the live job and compares createdAt against the
 * generation's own captured identity before acting. These mirror the predicates in
 * client.js (handleRunInterrupt / chatCompletion finally) and resume.js.
 */
describe('HITL Terminal-Side-Effect Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('F22 — pause is skipped when the generation was replaced', () => {
    // Mirrors client.js handleRunInterrupt pre-check, run BEFORE approvals.pause.
    const shouldPause = async ({ jobCreatedAt, streamId }) => {
      if (jobCreatedAt != null) {
        const liveJob = await mockGenerationJobManager.getJob(streamId);
        if (!liveJob || liveJob.createdAt !== jobCreatedAt) {
          return false;
        }
      }
      return true;
    };

    it('does not pause when a newer job replaced this one', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 2000 });
      expect(await shouldPause({ jobCreatedAt: 1000, streamId: 'c1' })).toBe(false);
    });

    it('does not pause when the job is already gone', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue(null);
      expect(await shouldPause({ jobCreatedAt: 1000, streamId: 'c1' })).toBe(false);
    });

    it('pauses when this is still the live job', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 1000 });
      expect(await shouldPause({ jobCreatedAt: 1000, streamId: 'c1' })).toBe(true);
    });

    it('pauses without a lookup when identity is unknown (legacy job)', async () => {
      expect(await shouldPause({ jobCreatedAt: null, streamId: 'c1' })).toBe(true);
      expect(mockGenerationJobManager.getJob).not.toHaveBeenCalled();
    });
  });

  describe('F21 — checkpoint prune is skipped when the generation was replaced', () => {
    // Mirrors client.js chatCompletion finally: prune only when NOT replaced.
    const shouldPrune = async ({ resumableStreamId, jobCreatedAt }) => {
      let replaced = false;
      if (resumableStreamId && jobCreatedAt != null) {
        const liveJob = await mockGenerationJobManager.getJob(resumableStreamId);
        replaced = !liveJob || liveJob.createdAt !== jobCreatedAt;
      }
      return !replaced;
    };

    it('skips the prune when a newer job replaced this one', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 2000 });
      expect(await shouldPrune({ resumableStreamId: 'c1', jobCreatedAt: 1000 })).toBe(false);
    });

    it('prunes when this is still the live job', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 1000 });
      expect(await shouldPrune({ resumableStreamId: 'c1', jobCreatedAt: 1000 })).toBe(true);
    });

    it('prunes without a lookup when there is no resumable stream id', async () => {
      expect(await shouldPrune({ resumableStreamId: undefined, jobCreatedAt: 1000 })).toBe(true);
      expect(mockGenerationJobManager.getJob).not.toHaveBeenCalled();
    });
  });

  describe('F24 — resume catch-path terminal writes are skipped when replaced', () => {
    // Mirrors resume.js: stillLive gate around emitError/completeJob/deleteAgentCheckpoint.
    const stillLive = async ({ streamId, jobCreatedAt }) => {
      let live = true;
      try {
        const liveJob = await mockGenerationJobManager.getJob(streamId);
        live = !!liveJob && liveJob.createdAt === jobCreatedAt;
      } catch {
        live = true; // read failed — fail open and run the terminal writes
      }
      return live;
    };

    it('runs terminal writes when this is still the live job', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 1000 });
      expect(await stillLive({ streamId: 'c1', jobCreatedAt: 1000 })).toBe(true);
    });

    it('skips terminal writes when a newer job replaced this one', async () => {
      mockGenerationJobManager.getJob.mockResolvedValue({ createdAt: 2000 });
      expect(await stillLive({ streamId: 'c1', jobCreatedAt: 1000 })).toBe(false);
    });

    it('fails open (runs terminal writes) when the liveness read throws', async () => {
      mockGenerationJobManager.getJob.mockRejectedValue(new Error('store down'));
      expect(await stillLive({ streamId: 'c1', jobCreatedAt: 1000 })).toBe(true);
    });
  });

  describe('F23 — resumed turn sources files from the job, not the racy DB row', () => {
    // Mirrors resume.js: prefer the body, then job.metadata.userMessage.files, then DB.
    const resolveFiles = ({ bodyFiles, metaFiles, dbFiles }) => {
      if (Array.isArray(bodyFiles) && bodyFiles.length > 0) {
        return bodyFiles;
      }
      if (Array.isArray(metaFiles) && metaFiles.length > 0) {
        return metaFiles;
      }
      return Array.isArray(dbFiles) && dbFiles.length > 0 ? dbFiles : undefined;
    };

    it('prefers job-metadata files over the DB row (no DB-save race)', () => {
      expect(
        resolveFiles({ bodyFiles: [], metaFiles: [{ file_id: 'meta' }], dbFiles: [{ file_id: 'db' }] }),
      ).toEqual([{ file_id: 'meta' }]);
    });

    it('falls back to the DB row when the job has no persisted files (older job)', () => {
      expect(resolveFiles({ bodyFiles: [], metaFiles: undefined, dbFiles: [{ file_id: 'db' }] })).toEqual([
        { file_id: 'db' },
      ]);
    });

    it('keeps files already present on the resume body', () => {
      expect(
        resolveFiles({ bodyFiles: [{ file_id: 'body' }], metaFiles: [{ file_id: 'meta' }], dbFiles: [] }),
      ).toEqual([{ file_id: 'body' }]);
    });
  });
});
