const { createStartHandler } = require('~/app/clients/callbacks');
const { spendTokens } = require('~/models/spendTokens');
const { logger } = require('~/config');

class RunManager {
  constructor(fields) {
    const { req, res, abortController, debug } = fields;
    this.abortController = abortController;
    this.user = req.user.id;
    this.req = req;
    this.res = res;
    this.debug = debug;
    this.runs = new Map();
    this.convos = new Map();
  }

  addRun(runId, runData) {
    if (!this.runs.has(runId)) {
      this.runs.set(runId, runData);
      if (runData.conversationId) {
        this.convos.set(runData.conversationId, runId);
      }
      return runData;
    } else {
      const existingData = this.runs.get(runId);
      const update = { ...existingData, ...runData };
      this.runs.set(runId, update);
      if (update.conversationId) {
        this.convos.set(update.conversationId, runId);
      }
      return update;
    }
  }

  removeRun(runId) {
    if (this.runs.has(runId)) {
      this.runs.delete(runId);
    } else {
      logger.error(`[api/app/clients/llm/RunManager] Run with ID ${runId} does not exist.`);
    }
  }

  getAllRuns() {
    return Array.from(this.runs.values());
  }

  getRunById(runId) {
    return this.runs.get(runId);
  }

  getRunByConversationId(conversationId) {
    const runId = this.convos.get(conversationId);
    return { run: this.runs.get(runId), runId };
  }

  createCallbacks(metadata) {
    return [
      {
        handleChatModelStart: createStartHandler({ ...metadata, manager: this }),
        handleLLMEnd: async (output, runId, _parentRunId) => {
          const { llmOutput, ..._output } = output;
          logger.debug(`[RunManager] handleLLMEnd: ${JSON.stringify(metadata)}`, {
            runId,
            _parentRunId,
            llmOutput,
          });

          if (metadata.context !== 'title') {
            logger.debug('[RunManager] handleLLMEnd:', {
              output: _output,
            });
          }

          const { tokenUsage } = output.llmOutput;
          const run = this.getRunById(runId);
          this.removeRun(runId);

          const txData = {
            user: this.user,
            model: run?.model ?? 'gpt-3.5-turbo',
            ...metadata,
          };

          await spendTokens(txData, tokenUsage);
        },
        handleLLMError: async (err) => {
          logger.error(`[RunManager] handleLLMError: ${JSON.stringify(metadata)}`, err);
          if (metadata.context === 'title') {
            return;
          } else if (metadata.context === 'plugins') {
            throw new Error(err);
          }
          const { conversationId } = metadata;
          const { run } = this.getRunByConversationId(conversationId);
          if (run && run.error) {
            const { error } = run;
            throw new Error(error);
          }
        },
      },
    ];
  }
}

module.exports = RunManager;
