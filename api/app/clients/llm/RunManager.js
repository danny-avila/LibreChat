const { createStartHandler } = require('../callbacks');
const { Transaction } = require('../../../models');

class RunManager {
  constructor(fields) {
    const { req, res, debug } = fields;
    this.user = req.user.id;
    this.req = req;
    this.res = res;
    this.debug = debug;
    this.runs = new Map();
  }

  addRun(runId, runData) {
    if (!this.runs.has(runId)) {
      this.runs.set(runId, runData);
      return runData;
    } else {
      const existingData = this.runs.get(runId);
      const update = { ...existingData, ...runData };
      this.runs.set(runId, update);
      return update;
    }
  }

  removeRun(runId) {
    if (this.runs.has(runId)) {
      this.runs.delete(runId);
    } else {
      console.error(`Run with ID ${runId} does not exist.`);
    }
  }

  getAllRuns() {
    return Array.from(this.runs.values());
  }

  getRunById(runId) {
    return this.runs.get(runId);
  }

  createCallbacks(metadata) {
    // const { context, conversationId } = metadata;
    return [
      {
        handleChatModelStart: createStartHandler({ ...metadata, manager: this }),
        handleLLMEnd: async (output, runId, _parentRunId) => {
          if (this.debug) {
            console.log(`handleLLMEnd: ${JSON.stringify(metadata)}`);
            console.dir({ output, runId, _parentRunId }, { depth: null });
          }
          const { tokenUsage } = output.llmOutput;
          const run = this.getRunById(runId);
          this.removeRun(runId);

          const txData = {
            user: this.user,
            model: run.model,
            ...metadata,
          };

          try {
            const prompt = await Transaction.create({
              ...txData,
              tokenType: 'prompt',
              rawAmount: -tokenUsage.promptTokens,
            });

            const completion = await Transaction.create({
              ...txData,
              tokenType: 'completion',
              rawAmount: -tokenUsage.completionTokens,
            });

            if (this.debug) {
              console.dir({ prompt, completion }, { depth: null });
            }
          } catch (err) {
            console.error(err);
          }
        },
        handleLLMError: async (err) => {
          console.log(`handleLLMError: ${JSON.stringify(metadata)}`);
          console.error(err);
        },
      },
    ];
  }
}

module.exports = RunManager;
