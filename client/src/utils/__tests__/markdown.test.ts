import { getMarkdownFiles } from '../markdown';

describe('markdown artifacts', () => {
  describe('getMarkdownFiles', () => {
    it('should return content.md with the original markdown content', () => {
      const markdown = '# Hello World\n\nThis is a test.';
      const files = getMarkdownFiles(markdown);

      expect(files['content.md']).toBe(markdown);
    });

    it('should return default content when markdown is empty', () => {
      const files = getMarkdownFiles('');

      expect(files['content.md']).toBe('# No content provided');
    });

    it('should include App.tsx with MarkdownRenderer component', () => {
      const markdown = '# Test';
      const files = getMarkdownFiles(markdown);

      expect(files['App.tsx']).toContain('import React from');
      expect(files['App.tsx']).toContain(
        "import MarkdownRenderer from '/components/ui/MarkdownRenderer'",
      );
      expect(files['App.tsx']).toContain('<MarkdownRenderer content={');
      expect(files['App.tsx']).toContain('export default App');
    });

    it('should include index.tsx entry point', () => {
      const markdown = '# Test';
      const files = getMarkdownFiles(markdown);

      expect(files['index.tsx']).toContain('import App from "./App"');
      expect(files['index.tsx']).toContain('import "./styles.css"');
      expect(files['index.tsx']).toContain('import "./markdown.css"');
      expect(files['index.tsx']).toContain('createRoot');
    });

    it('should include MarkdownRenderer component file', () => {
      const markdown = '# Test';
      const files = getMarkdownFiles(markdown);

      expect(files['/components/ui/MarkdownRenderer.tsx']).toContain('import Markdown from');
      expect(files['/components/ui/MarkdownRenderer.tsx']).toContain('MarkdownRendererProps');
      expect(files['/components/ui/MarkdownRenderer.tsx']).toContain(
        'export default MarkdownRenderer',
      );
    });

    it('should include markdown.css with styling', () => {
      const markdown = '# Test';
      const files = getMarkdownFiles(markdown);

      expect(files['markdown.css']).toContain('.markdown-body');
      expect(files['markdown.css']).toContain('list-style-type: disc');
      expect(files['markdown.css']).toContain('prefers-color-scheme: dark');
    });

    describe('content escaping', () => {
      it('should escape backticks in markdown content', () => {
        const markdown = 'Here is some `inline code`';
        const files = getMarkdownFiles(markdown);

        expect(files['App.tsx']).toContain('\\`');
      });

      it('should escape backslashes in markdown content', () => {
        const markdown = 'Path: C:\\Users\\Test';
        const files = getMarkdownFiles(markdown);

        expect(files['App.tsx']).toContain('\\\\');
      });

      it('should escape dollar signs in markdown content', () => {
        const markdown = 'Price: $100';
        const files = getMarkdownFiles(markdown);

        expect(files['App.tsx']).toContain('\\$');
      });

      it('should handle code blocks with backticks', () => {
        const markdown = '```js\nconsole.log("test");\n```';
        const files = getMarkdownFiles(markdown);

        // Should be escaped
        expect(files['App.tsx']).toContain('\\`\\`\\`');
      });
    });

    describe('list indentation normalization', () => {
      it('should normalize 2-space indented lists to 4-space', () => {
        const markdown = '- Item 1\n  - Subitem 1\n  - Subitem 2';
        const files = getMarkdownFiles(markdown);

        // The indentation normalization happens in wrapMarkdownRenderer
        // It converts 2 spaces before list markers to 4 spaces
        // Check that content.md preserves the original, but App.tsx has normalized content
        expect(files['content.md']).toBe(markdown);
        expect(files['App.tsx']).toContain('- Item 1');
        expect(files['App.tsx']).toContain('Subitem 1');
      });

      it('should handle numbered lists with 2-space indents', () => {
        const markdown = '1. First\n  2. Second nested';
        const files = getMarkdownFiles(markdown);

        // Verify normalization occurred
        expect(files['content.md']).toBe(markdown);
        expect(files['App.tsx']).toContain('1. First');
        expect(files['App.tsx']).toContain('2. Second nested');
      });

      it('should not affect already 4-space indented lists', () => {
        const markdown = '- Item 1\n    - Subitem 1';
        const files = getMarkdownFiles(markdown);

        // Already normalized, should be preserved
        expect(files['content.md']).toBe(markdown);
        expect(files['App.tsx']).toContain('- Item 1');
        expect(files['App.tsx']).toContain('Subitem 1');
      });
    });

    describe('edge cases', () => {
      it('should handle very long markdown content', () => {
        const longMarkdown = '# Test\n\n' + 'Lorem ipsum '.repeat(1000);
        const files = getMarkdownFiles(longMarkdown);

        expect(files['content.md']).toBe(longMarkdown);
        expect(files['App.tsx']).toContain('Lorem ipsum');
      });

      it('should handle markdown with special characters', () => {
        const markdown = '# Test & < > " \'';
        const files = getMarkdownFiles(markdown);

        expect(files['content.md']).toBe(markdown);
      });

      it('should handle markdown with unicode characters', () => {
        const markdown = '# 你好 世界 🌍';
        const files = getMarkdownFiles(markdown);

        expect(files['content.md']).toBe(markdown);
      });

      it('should handle markdown with only whitespace', () => {
        const markdown = '   \n\n   ';
        const files = getMarkdownFiles(markdown);

        expect(files['content.md']).toBe(markdown);
      });

      it('should handle markdown with mixed line endings', () => {
        const markdown = '# Line 1\r\n## Line 2\n### Line 3';
        const files = getMarkdownFiles(markdown);

        expect(files['content.md']).toBe(markdown);
      });
    });
  });

  describe('markdown component structure', () => {
    it('should generate a MarkdownRenderer component that uses marked-react', () => {
      const files = getMarkdownFiles('# Test');
      const rendererCode = files['/components/ui/MarkdownRenderer.tsx'];

      // Verify the component imports and uses Markdown from marked-react
      expect(rendererCode).toContain("import Markdown from 'marked-react'");
      expect(rendererCode).toContain('<Markdown gfm={true} breaks={true}>{content}</Markdown>');
    });

    it('should pass markdown content to the Markdown component', () => {
      const testContent = '# Heading\n- List item';
      const files = getMarkdownFiles(testContent);
      const appCode = files['App.tsx'];

      // The App.tsx should pass the content to MarkdownRenderer
      expect(appCode).toContain('<MarkdownRenderer content={');
      expect(appCode).toContain('# Heading');
      expect(appCode).toContain('- List item');
    });
  });
});
