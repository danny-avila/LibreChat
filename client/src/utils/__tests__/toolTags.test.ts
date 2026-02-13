import { parseToolTags, ToolSegment } from '../toolTags';

describe('parseToolTags', () => {
  describe('single tool blocks', () => {
    it('should parse a single pending tool (no newline)', () => {
      const input = '<tool>save_file(file=a.py)</tool>';
      const result = parseToolTags(input);

      expect(result).toEqual([
        {
          type: 'tool',
          name: 'save_file',
          call: 'save_file(file=a.py)',
          result: null,
          raw: '<tool>save_file(file=a.py)</tool>',
        },
      ]);
    });

    it('should parse a single completed tool with result', () => {
      const input = '<tool>save_file(file=a.py)\nok</tool>';
      const result = parseToolTags(input);

      expect(result).toEqual([
        {
          type: 'tool',
          name: 'save_file',
          call: 'save_file(file=a.py)',
          result: 'ok',
          raw: '<tool>save_file(file=a.py)\nok</tool>',
        },
      ]);
    });

    it('should parse a completed tool with empty result', () => {
      const input = '<tool>save_file(file=a.py)\n</tool>';
      const result = parseToolTags(input);

      expect(result).toEqual([
        {
          type: 'tool',
          name: 'save_file',
          call: 'save_file(file=a.py)',
          result: '',
          raw: '<tool>save_file(file=a.py)\n</tool>',
        },
      ]);
    });
  });

  describe('mixed content', () => {
    it('should parse mixed text + tool + text into three segments', () => {
      const input = 'Here is some text\n\n<tool>run_shell(cmd=ls)\nfile1.txt\nfile2.txt</tool>\n\nMore text after';
      const result = parseToolTags(input);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', text: 'Here is some text\n\n' });
      expect(result[1]).toEqual({
        type: 'tool',
        name: 'run_shell',
        call: 'run_shell(cmd=ls)',
        result: 'file1.txt\nfile2.txt',
        raw: '<tool>run_shell(cmd=ls)\nfile1.txt\nfile2.txt</tool>',
      });
      expect(result[2]).toEqual({ type: 'text', text: '\n\nMore text after' });
    });

    it('should handle multiple tool blocks in sequence', () => {
      const input =
        '<tool>save_file(file=a.py)\nok</tool>\n\n<tool>run_shell(cmd=pwd)\n/app</tool>';
      const result = parseToolTags(input);

      const toolSegments = result.filter((s): s is Extract<ToolSegment, { type: 'tool' }> => s.type === 'tool');
      expect(toolSegments).toHaveLength(2);
      expect(toolSegments[0].name).toBe('save_file');
      expect(toolSegments[0].result).toBe('ok');
      expect(toolSegments[1].name).toBe('run_shell');
      expect(toolSegments[1].result).toBe('/app');
    });
  });

  describe('tool-group handling', () => {
    it('should parse <tool-group> with two tools into two tool segments', () => {
      const input = `<tool-group>
<tool>save_file(file=a.py)
ok</tool>

<tool>run_shell(cmd=pwd)
/app</tool>
</tool-group>`;
      const result = parseToolTags(input);

      const toolSegments = result.filter((s): s is Extract<ToolSegment, { type: 'tool' }> => s.type === 'tool');
      expect(toolSegments).toHaveLength(2);
      expect(toolSegments[0].name).toBe('save_file');
      expect(toolSegments[0].result).toBe('ok');
      expect(toolSegments[1].name).toBe('run_shell');
      expect(toolSegments[1].result).toBe('/app');
    });

    it('should handle text before and after tool-group', () => {
      const input = 'Before\n\n<tool-group>\n<tool>foo()\nbar</tool>\n</tool-group>\n\nAfter';
      const result = parseToolTags(input);

      expect(result[0]).toEqual({ type: 'text', text: 'Before\n\n' });
      expect(result[1]).toEqual({
        type: 'tool',
        name: 'foo',
        call: 'foo()',
        result: 'bar',
        raw: '<tool>foo()\nbar</tool>',
      });
      expect(result[result.length - 1]).toEqual({ type: 'text', text: '\n\nAfter' });
    });
  });

  describe('malformed / streaming edge cases', () => {
    it('should treat unclosed <tool> tag as plain text', () => {
      const input = 'Hello <tool>save_file(file=a.py)';
      const result = parseToolTags(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'text', text: 'Hello ' });
      expect(result[1]).toEqual({ type: 'text', text: '<tool>save_file(file=a.py)' });
    });

    it('should treat unclosed <tool-group> as plain text', () => {
      const input = '<tool-group><tool>foo()\nbar</tool>';
      const result = parseToolTags(input);

      // Unclosed group → entire rest becomes text
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
    });
  });

  describe('HTML entity decoding', () => {
    it('should decode HTML entities in call and result content', () => {
      const input = '<tool>save_file(content=&lt;div&gt;hello&lt;/div&gt;)\n&amp;done</tool>';
      const result = parseToolTags(input);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].call).toBe('save_file(content=<div>hello</div>)');
        expect(result[0].result).toBe('&done');
      }
    });

    it('should decode &quot; entities', () => {
      const input = '<tool>save_file(msg=&quot;hello&quot;)\nok</tool>';
      const result = parseToolTags(input);

      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].call).toBe('save_file(msg="hello")');
      }
    });
  });

  describe('empty and trivial inputs', () => {
    it('should return single text segment for empty input', () => {
      const result = parseToolTags('');
      expect(result).toEqual([{ type: 'text', text: '' }]);
    });

    it('should return single text segment for plain text (no tags)', () => {
      const input = 'Just normal text with no tool tags';
      const result = parseToolTags(input);
      expect(result).toEqual([{ type: 'text', text: input }]);
    });
  });

  describe('tool name extraction', () => {
    it('should extract name before first parenthesis', () => {
      const input = '<tool>my_function(arg1=val1, arg2=val2)\nresult</tool>';
      const result = parseToolTags(input);

      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].name).toBe('my_function');
      }
    });

    it('should fallback to "tool" when no parenthesis', () => {
      const input = '<tool>something without parens\nresult</tool>';
      const result = parseToolTags(input);

      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].name).toBe('tool');
      }
    });

    it('should fallback to "tool" when call starts with parenthesis', () => {
      const input = '<tool>(weird)\nresult</tool>';
      const result = parseToolTags(input);

      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].name).toBe('tool');
      }
    });
  });

  describe('multiline results', () => {
    it('should preserve multiline result content', () => {
      const input = '<tool>run_shell(cmd=cat file.txt)\nline 1\nline 2\nline 3</tool>';
      const result = parseToolTags(input);

      expect(result[0].type).toBe('tool');
      if (result[0].type === 'tool') {
        expect(result[0].result).toBe('line 1\nline 2\nline 3');
      }
    });
  });

  describe('ordering preservation', () => {
    it('should preserve exact ordering of text and tool segments', () => {
      const input = 'A\n\n<tool>t1()\nr1</tool>\n\nB\n\n<tool>t2()\nr2</tool>\n\nC';
      const result = parseToolTags(input);

      const types = result.map((s) => s.type);
      expect(types).toEqual(['text', 'tool', 'text', 'tool', 'text']);
    });
  });
});
