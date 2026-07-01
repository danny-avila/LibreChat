const { buildStepPrompt, parseStepStatus, summarizeStep } = require('./prompt');

describe('Jobs prompt helpers', () => {
  describe('buildStepPrompt', () => {
    it('includes the goal and asks for the first step when index is 0', () => {
      const prompt = buildStepPrompt({ goal: 'Write a report', stepIndex: 0, maxSteps: 5 });
      expect(prompt).toContain('Write a report');
      expect(prompt).toContain('first meaningful step');
      expect(prompt).toContain('STATUS: CONTINUE');
    });

    it('includes prior work and continues on later steps', () => {
      const prompt = buildStepPrompt({
        goal: 'Write a report',
        stepSummaries: ['gathered sources', 'drafted intro'],
        stepIndex: 2,
        maxSteps: 5,
      });
      expect(prompt).toContain('WORK DONE SO FAR');
      expect(prompt).toContain('gathered sources');
      expect(prompt).toContain('next single step');
      expect(prompt).toContain('at most 3 step(s) left');
    });
  });

  describe('parseStepStatus', () => {
    it('detects DONE', () => {
      expect(parseStepStatus('all set\nSTATUS: DONE')).toBe('DONE');
      expect(parseStepStatus('status: done')).toBe('DONE');
    });

    it('detects CONTINUE', () => {
      expect(parseStepStatus('more to do\nSTATUS: CONTINUE')).toBe('CONTINUE');
    });

    it('defaults to CONTINUE when absent or non-string', () => {
      expect(parseStepStatus('no marker')).toBe('CONTINUE');
      expect(parseStepStatus(undefined)).toBe('CONTINUE');
      expect(parseStepStatus(null)).toBe('CONTINUE');
    });
  });

  describe('summarizeStep', () => {
    it('strips the status line and collapses whitespace', () => {
      const summary = summarizeStep('Did   the\nthing.\nSTATUS: CONTINUE');
      expect(summary).toBe('Did the thing.');
    });

    it('truncates long output', () => {
      const summary = summarizeStep('x'.repeat(500), 100);
      expect(summary.length).toBe(100);
      expect(summary.endsWith('…')).toBe(true);
    });

    it('handles empty output', () => {
      expect(summarizeStep('')).toBe('(no output)');
      expect(summarizeStep('STATUS: DONE')).toBe('(no output)');
    });
  });
});
