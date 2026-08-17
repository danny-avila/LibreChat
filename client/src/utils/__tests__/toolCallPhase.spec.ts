import type { ToolCallPhaseInput } from '../toolCallPhase';
import { resolveToolCallPhase } from '../toolCallPhase';

const resolve = (overrides: Partial<ToolCallPhaseInput> = {}) =>
  resolveToolCallPhase({
    progress: 1,
    isSubmitting: false,
    hasError: false,
    ...overrides,
  });

describe('resolveToolCallPhase', () => {
  describe('with an explicit run-step status', () => {
    it('reports a completed close as completed', () => {
      expect(resolve({ runStepStatus: 'completed' })).toBe('completed');
    });

    it('reports a failed close as failed', () => {
      expect(resolve({ runStepStatus: 'failed' })).toBe('failed');
    });

    it('reports a cancelled close as cancelled', () => {
      expect(resolve({ runStepStatus: 'cancelled' })).toBe('cancelled');
    });

    /**
     * The status is authoritative on its own terms. Gating it on output
     * parsing let a step the run reported as stopped be demoted back into an
     * in-flight state.
     */
    it('never returns running for a closed step, whatever progress says', () => {
      expect(resolve({ runStepStatus: 'completed', progress: 0.4 })).toBe('completed');
      expect(resolve({ runStepStatus: 'cancelled', progress: 0.1, isSubmitting: true })).toBe(
        'cancelled',
      );
    });

    /** Explicit cancellation outranks a failure-shaped result. */
    it('keeps a cancelled close cancelled even when the output parses as an error', () => {
      expect(resolve({ runStepStatus: 'cancelled', hasError: true })).toBe('cancelled');
    });

    /** A completed close whose result reads as a failure is still a failure —
     *  the card must not present an error as a clean success. */
    it('reports a completed close with error output as failed', () => {
      expect(resolve({ runStepStatus: 'completed', hasError: true })).toBe('failed');
    });
  });

  describe('under the legacy heuristic', () => {
    it('reports an in-flight call as running', () => {
      expect(resolve({ progress: 0.4, isSubmitting: true })).toBe('running');
    });

    it('reports a settled call as completed', () => {
      expect(resolve({ progress: 1, isSubmitting: true })).toBe('completed');
    });

    /** Unfinished progress with the message no longer streaming is the only
     *  signal the pre-`on_run_step_closed` path had for a stop. */
    it('infers cancellation from an unfinished call once submission ends', () => {
      expect(resolve({ progress: 0.4, isSubmitting: false })).toBe('cancelled');
    });

    /**
     * The precedence inverts here, deliberately: the cancellation inference
     * ("not submitting and not finished") is also satisfied by a genuine
     * failure, so applying the explicit-close ordering relabelled real
     * failures as user stops on historical messages.
     */
    it('lets failure outrank the cancellation inference', () => {
      expect(resolve({ progress: 0.4, isSubmitting: false, hasError: true })).toBe('failed');
    });

    it('reports a failure even while the message is still streaming', () => {
      expect(resolve({ progress: 0.4, isSubmitting: true, hasError: true })).toBe('failed');
    });
  });

  /**
   * The two precedence rules are opposites and have been collapsed into one
   * another twice under review. Pinned side by side so a future edit cannot
   * quietly unify them.
   */
  it('applies opposite precedence for an explicit close and the heuristic', () => {
    const withError = { hasError: true, progress: 0.4, isSubmitting: false };
    expect(resolve({ ...withError, runStepStatus: 'cancelled' })).toBe('cancelled');
    expect(resolve(withError)).toBe('failed');
  });
});
