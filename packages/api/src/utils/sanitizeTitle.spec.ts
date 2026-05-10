import { sanitizeTitle, MAX_TITLE_LENGTH, DEFAULT_TITLE_FALLBACK } from './sanitizeTitle';

describe('sanitizeTitle', () => {
  describe('Happy Path', () => {
    it('should remove a single think block and return the clean title', () => {
      const input = '<think>This is reasoning about the topic</think> User Hi Greeting';
      expect(sanitizeTitle(input)).toBe('User Hi Greeting');
    });

    it('should handle thinking block at the start', () => {
      const input = '<think>reasoning here</think> Clean Title Text';
      expect(sanitizeTitle(input)).toBe('Clean Title Text');
    });

    it('should handle thinking block at the end', () => {
      const input = 'Clean Title Text <think>reasoning here</think>';
      expect(sanitizeTitle(input)).toBe('Clean Title Text');
    });

    it('should handle title without any thinking blocks', () => {
      const input = 'Just a Normal Title';
      expect(sanitizeTitle(input)).toBe('Just a Normal Title');
    });
  });

  describe('Multiple Blocks', () => {
    it('should remove multiple think blocks', () => {
      const input =
        '<think>reason 1</think> Intro <think>reason 2</think> Middle <think>reason 3</think> Final';
      expect(sanitizeTitle(input)).toBe('Intro Middle Final');
    });

    it('should handle consecutive think blocks', () => {
      const input = '<think>r1</think><think>r2</think>Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle uppercase THINK tags', () => {
      const input = '<THINK>reasoning</THINK> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should handle mixed case Think tags', () => {
      const input = '<Think>reasoning</ThInk> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should handle mixed case closing tag', () => {
      const input = '<think>reasoning</THINK> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });
  });

  describe('Attributes in Tags', () => {
    it('should remove think tags with attributes', () => {
      const input = '<think reason="complex logic">reasoning here</think> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should handle multiple attributes', () => {
      const input = '<think reason="test" type="deep" id="1">reasoning</think> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should handle single-quoted attributes', () => {
      const input = "<think reason='explanation'>content</think> Title";
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should handle unquoted attributes', () => {
      const input = '<think x=y>reasoning</think> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });
  });

  describe('Newlines and Multiline Content', () => {
    it('should handle newlines within the think block', () => {
      const input = `<think>
        This is a long reasoning
        spanning multiple lines
        with various thoughts
      </think> Clean Title`;
      expect(sanitizeTitle(input)).toBe('Clean Title');
    });

    it('should handle newlines around tags', () => {
      const input = `
        <think>reasoning</think>
        My Title
      `;
      expect(sanitizeTitle(input)).toBe('My Title');
    });

    it('should handle mixed whitespace', () => {
      const input = '<think>\n\t  reasoning  \t\n</think>\n Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });
  });

  describe('Whitespace Normalization', () => {
    it('should collapse multiple spaces', () => {
      const input = '<think>x</think>   Multiple   Spaces';
      expect(sanitizeTitle(input)).toBe('Multiple Spaces');
    });

    it('should collapse mixed whitespace', () => {
      const input = 'Start  \n\t  Middle  <think>x</think>  \n  End';
      expect(sanitizeTitle(input)).toBe('Start Middle End');
    });

    it('should trim leading whitespace', () => {
      const input = '  <think>reasoning</think> Title';
      expect(sanitizeTitle(input)).toBe('Title');
    });

    it('should trim trailing whitespace', () => {
      const input = 'Title <think>reasoning</think>  \n  ';
      expect(sanitizeTitle(input)).toBe('Title');
    });
  });

  describe('Empty and Fallback Cases', () => {
    it('should return fallback for empty string', () => {
      expect(sanitizeTitle('')).toBe(DEFAULT_TITLE_FALLBACK);
    });

    it('should return fallback when only whitespace remains', () => {
      const input = '<think>thinking</think>     \n\t\r\n    ';
      expect(sanitizeTitle(input)).toBe(DEFAULT_TITLE_FALLBACK);
    });

    it('should return fallback when only think blocks exist', () => {
      const input = '<think>just thinking</think><think>more thinking</think>';
      expect(sanitizeTitle(input)).toBe(DEFAULT_TITLE_FALLBACK);
    });

    it('should return fallback for non-string whitespace', () => {
      expect(sanitizeTitle('   ')).toBe(DEFAULT_TITLE_FALLBACK);
    });
  });

  describe('Edge Cases and Real-World', () => {
    it('should handle long reasoning blocks', () => {
      const longReasoning =
        'This is a very long reasoning block ' + 'with lots of text. '.repeat(50);
      const input = `<think>${longReasoning}</think> Final Title`;
      expect(sanitizeTitle(input)).toBe('Final Title');
    });

    it('should handle nested-like patterns', () => {
      const input = '<think>outer <think>inner</think> end</think> Title';
      const result = sanitizeTitle(input);
      expect(result).toContain('Title');
    });

    it('should handle malformed tags missing closing', () => {
      const input = '<think>unclosed reasoning. Title';
      const result = sanitizeTitle(input);
      expect(result).toContain('Title');
      expect(result).toContain('<think>');
    });

    it('should handle real-world LLM example', () => {
      const input =
        '<think>\nThe user is asking for a greeting. I should provide a friendly response.\n</think> User Hi Greeting';
      expect(sanitizeTitle(input)).toBe('User Hi Greeting');
    });

    it('should handle real-world with attributes', () => {
      const input = '<think reasoning="multi-step">\nStep 1\nStep 2\n</think> Project Status';
      expect(sanitizeTitle(input)).toBe('Project Status');
    });
  });

  describe('Max Length Truncation', () => {
    const ellipsis = '...';
    const maxContent = MAX_TITLE_LENGTH - ellipsis.length;

    it('should pass through a title exactly at max length unchanged', () => {
      const input = 'A'.repeat(MAX_TITLE_LENGTH);
      expect(sanitizeTitle(input)).toBe(input);
    });

    it('should truncate a title over max length with ellipsis', () => {
      const input = 'A'.repeat(MAX_TITLE_LENGTH + 50);
      const result = sanitizeTitle(input);
      expect(result).toBe('A'.repeat(maxContent) + ellipsis);
      expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    it('should truncate after think-block removal', () => {
      const input = '<think>reasoning</think> ' + 'B'.repeat(MAX_TITLE_LENGTH + 50);
      const result = sanitizeTitle(input);
      expect(result).toBe('B'.repeat(maxContent) + ellipsis);
      expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    it('should trimEnd before appending ellipsis when slice ends with whitespace', () => {
      const input = 'A'.repeat(maxContent - 1) + ' B' + 'C'.repeat(MAX_TITLE_LENGTH);
      const result = sanitizeTitle(input);
      expect(result).toBe('A'.repeat(maxContent - 1) + ellipsis);
      expect(result).not.toMatch(/ \.\.\./);
    });

    it('should not produce lone surrogates when truncating emoji titles', () => {
      const input = 'A'.repeat(MAX_TITLE_LENGTH - 2) + '\u{1F389}rest';
      const result = sanitizeTitle(input);
      expect(result.isWellFormed()).toBe(true);
      expect([...result].length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    it('should handle a title composed entirely of emoji', () => {
      const emoji = '\u{1F680}';
      const input = emoji.repeat(MAX_TITLE_LENGTH + 10);
      const result = sanitizeTitle(input);
      expect(result.isWellFormed()).toBe(true);
      expect(result.endsWith(ellipsis)).toBe(true);
      expect([...result].length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });
  });

  describe('Idempotency', () => {
    it('should be idempotent', () => {
      const input = '<think>reasoning</think> My Title';
      const once = sanitizeTitle(input);
      const twice = sanitizeTitle(once);
      expect(once).toBe(twice);
      expect(once).toBe('My Title');
    });

    it('should be idempotent with fallback', () => {
      const input = '<think>only thinking</think>';
      const once = sanitizeTitle(input);
      const twice = sanitizeTitle(once);
      expect(once).toBe(twice);
      expect(once).toBe(DEFAULT_TITLE_FALLBACK);
    });
  });

  describe('Return Type Safety', () => {
    it('should always return a string', () => {
      expect(typeof sanitizeTitle('<think>x</think> Title')).toBe('string');
      expect(typeof sanitizeTitle('No blocks')).toBe('string');
      expect(typeof sanitizeTitle('')).toBe('string');
    });

    it('should never return empty', () => {
      expect(sanitizeTitle('')).not.toBe('');
      expect(sanitizeTitle('  ')).not.toBe('');
      expect(sanitizeTitle('<think>x</think>')).not.toBe('');
    });

    it('should never return null or undefined', () => {
      expect(sanitizeTitle('test')).not.toBeNull();
      expect(sanitizeTitle('test')).not.toBeUndefined();
      expect(sanitizeTitle('')).not.toBeNull();
      expect(sanitizeTitle('')).not.toBeUndefined();
    });
  });
});
