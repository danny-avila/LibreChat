const {
  buildStepPrompt,
  parseStepStatus,
  summarizeStep,
  buildDisplayUserText,
  formatStepResponseForDisplay,
  buildDisplayResponseText,
  formatClientOpResultForDisplay,
} = require('./prompt');

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

  describe('buildDisplayUserText', () => {
    it('shows the goal on the first step only', () => {
      expect(buildDisplayUserText({ stepIndex: 0, goal: '  List my files  ' })).toBe(
        'List my files',
      );
      expect(buildDisplayUserText({ stepIndex: 1, goal: 'List my files' })).toBeNull();
    });
  });

  describe('formatStepResponseForDisplay', () => {
    it('removes control lines and leaked prompt instructions', () => {
      const raw = [
        'Here are your files:',
        '- notes.txt',
        'STATUS: DONE',
        'Continue with the next single step toward the goal now.',
        'CLIENT_OP: {"op":"listDir","path":""}',
      ].join('\n');

      expect(formatStepResponseForDisplay(raw)).toBe('Here are your files:\n- notes.txt');
    });
  });

  describe('buildDisplayResponseText', () => {
    it('shows a friendly line when the model only emitted CLIENT_OP', () => {
      expect(buildDisplayResponseText('CLIENT_OP: {"op":"listDir","path":""}')).toBe(
        'Checking your connected folder…',
      );
    });

    it('lists .txt files when the goal asks for them and the model only returned STATUS: DONE', () => {
      const display = buildDisplayResponseText('STATUS: DONE', {
        goal: 'list txt files of my connected folder',
        lastClientOpResult: {
          op: { op: 'listDir', path: '' },
          result: [
            { name: 'notes.txt', kind: 'file' },
            { name: 'readme.md', kind: 'file' },
          ],
        },
      });

      expect(display).toContain('notes.txt');
      expect(display).not.toContain('readme.md');
    });
  });
});
