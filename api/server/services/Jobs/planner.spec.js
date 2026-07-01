const { decideNextStep, canRunStep } = require('./planner');

describe('Jobs planner', () => {
  describe('canRunStep', () => {
    it('allows a step below the cap', () => {
      expect(canRunStep({ currentStep: 0, maxSteps: 5 })).toBe(true);
      expect(canRunStep({ currentStep: 4, maxSteps: 5 })).toBe(true);
    });

    it('blocks a step at or beyond the cap', () => {
      expect(canRunStep({ currentStep: 5, maxSteps: 5 })).toBe(false);
      expect(canRunStep({ currentStep: 6, maxSteps: 5 })).toBe(false);
    });

    it('defaults a missing currentStep to zero', () => {
      expect(canRunStep({ maxSteps: 3 })).toBe(true);
    });
  });

  describe('decideNextStep', () => {
    it('continues when the model signals CONTINUE and the cap is not reached', () => {
      const decision = decideNextStep({
        job: { maxSteps: 5 },
        stepIndex: 0,
        responseText: 'Did some work.\nSTATUS: CONTINUE',
        priorSummaries: [],
        messageId: 'm0',
      });

      expect(decision.isDone).toBe(false);
      expect(decision.status).toBe('running');
      expect(decision.currentStep).toBe(1);
      expect(decision.checkpoint.lastMessageId).toBe('m0');
      expect(decision.checkpoint.stepSummaries).toHaveLength(1);
    });

    it('finishes when the model signals DONE', () => {
      const decision = decideNextStep({
        job: { maxSteps: 5 },
        stepIndex: 1,
        responseText: 'Final answer.\nSTATUS: DONE',
        priorSummaries: ['step 0 summary'],
        messageId: 'm1',
      });

      expect(decision.isDone).toBe(true);
      expect(decision.status).toBe('done');
      expect(decision.currentStep).toBe(2);
      expect(decision.checkpoint.stepSummaries).toEqual(['step 0 summary', expect.any(String)]);
    });

    it('finishes when the step cap is reached even if the model says CONTINUE', () => {
      const decision = decideNextStep({
        job: { maxSteps: 2 },
        stepIndex: 1,
        responseText: 'Still going.\nSTATUS: CONTINUE',
        priorSummaries: ['s0'],
        messageId: 'm1',
      });

      expect(decision.isDone).toBe(true);
      expect(decision.status).toBe('done');
    });

    it('defaults to continue when no status line is present', () => {
      const decision = decideNextStep({
        job: { maxSteps: 5 },
        stepIndex: 0,
        responseText: 'No explicit status here.',
        priorSummaries: [],
        messageId: 'm0',
      });

      expect(decision.status).toBe('running');
    });

    it('accumulates summaries across steps in order', () => {
      const decision = decideNextStep({
        job: { maxSteps: 5 },
        stepIndex: 2,
        responseText: 'Third step output. STATUS: CONTINUE',
        priorSummaries: ['first', 'second'],
        messageId: 'm2',
      });

      expect(decision.checkpoint.stepSummaries.slice(0, 2)).toEqual(['first', 'second']);
      expect(decision.checkpoint.stepSummaries).toHaveLength(3);
    });
  });
});
