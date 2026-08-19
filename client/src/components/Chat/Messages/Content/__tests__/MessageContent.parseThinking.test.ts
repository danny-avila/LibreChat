import { parseThinkingContent } from '~/utils/parseThinking';

describe('parseThinkingContent', () => {
  describe(':::thinking::: directive format (legacy)', () => {
    it('extracts thinking and regular content', () => {
      const text = ':::thinking\nsome reasoning\n:::\nActual response';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('some reasoning');
      expect(result.regularContent).toBe('Actual response');
    });

    it('returns empty thinking when no match', () => {
      const text = 'No thinking here';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('');
      expect(result.regularContent).toBe('No thinking here');
    });
  });

  describe('<think> tag format (custom endpoints)', () => {
    it('extracts full thinking and response when both tags present', () => {
      const text = '<think>reasoning text</think>\n\nActual response';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('reasoning text');
      expect(result.regularContent).toBe('Actual response');
    });

    it('shows partial thinking when </think> not yet received (mid-stream)', () => {
      const text = '<think>partial reasoning...';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('partial reasoning...');
      expect(result.regularContent).toBe('');
    });

    it('handles empty response after </think>', () => {
      const text = '<think>reasoning</think>';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('reasoning');
      expect(result.regularContent).toBe('');
    });

    it('is case-insensitive for <THINK> tags', () => {
      const text = '<THINK>reasoning</THINK>\n\nResponse';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('reasoning');
      expect(result.regularContent).toBe('Response');
    });

    it('trims whitespace from thinking and response', () => {
      const text = '<think>\n  reasoning content  \n</think>\n\n  response text  ';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('reasoning content');
      expect(result.regularContent).toBe('response text');
    });

    it('does not match <think> in the middle of text', () => {
      const text = 'Regular text <think>not at start</think>';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('');
      expect(result.regularContent).toBe('Regular text <think>not at start</think>');
    });

    it('handles multiline reasoning content', () => {
      const text = '<think>\nLine one\nLine two\nLine three\n</think>\n\nThe answer';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('Line one\nLine two\nLine three');
      expect(result.regularContent).toBe('The answer');
    });
  });

  describe('plain text', () => {
    it('returns empty thinking and original text for plain content', () => {
      const text = 'Just a plain response';
      const result = parseThinkingContent(text);
      expect(result.thinkingContent).toBe('');
      expect(result.regularContent).toBe('Just a plain response');
    });

    it('handles empty string', () => {
      const result = parseThinkingContent('');
      expect(result.thinkingContent).toBe('');
      expect(result.regularContent).toBe('');
    });
  });
});
