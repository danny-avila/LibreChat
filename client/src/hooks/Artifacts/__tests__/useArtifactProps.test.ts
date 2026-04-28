import { renderHook } from '@testing-library/react';
import useArtifactProps, { wrapAsFencedCodeBlock } from '../useArtifactProps';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import type { Artifact } from '~/common';

describe('useArtifactProps', () => {
  const createArtifact = (partial: Partial<Artifact>): Artifact => ({
    id: 'test-id',
    lastUpdateTime: Date.now(),
    ...partial,
  });

  describe('markdown artifacts', () => {
    it('should handle text/markdown type with content.md as fileKey', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Hello World\n\nThis is markdown.',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.template).toBe('static');
    });

    it('should handle text/plain type with content.md as fileKey', () => {
      const artifact = createArtifact({
        type: 'text/plain',
        content: '# Plain text as markdown',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.template).toBe('static');
    });

    it('should include content.md in files with original markdown', () => {
      const markdownContent = '# Test\n\n- Item 1\n- Item 2';
      const artifact = createArtifact({
        type: 'text/markdown',
        content: markdownContent,
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['content.md']).toBe(markdownContent);
    });

    it('should include index.html with static markdown rendering', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['index.html']).toContain('<!DOCTYPE html>');
      expect(result.current.files['index.html']).toContain('marked.parse');
    });

    it('should include all required markdown files', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['content.md']).toBeDefined();
      expect(result.current.files['index.html']).toBeDefined();
    });

    it('should escape special characters in markdown content', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: 'Code: `const x = 1;`\nPath: C:\\Users',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['content.md']).toContain('`const x = 1;`');
      expect(result.current.files['content.md']).toContain('C:\\Users');

      expect(result.current.files['index.html']).toContain('\\`');
      expect(result.current.files['index.html']).toContain('\\\\');
    });

    it('should handle empty markdown content', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['content.md']).toBe('# No content provided');
    });

    it('should handle undefined markdown content', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['content.md']).toBe('# No content provided');
    });

    it('should have no custom dependencies for markdown (uses CDN)', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      const deps = result.current.sharedProps.customSetup?.dependencies ?? {};
      expect(deps).toEqual({});
    });

    it('should update files when content changes', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Original',
      });

      const { result, rerender } = renderHook(({ artifact }) => useArtifactProps({ artifact }), {
        initialProps: { artifact },
      });

      expect(result.current.files['content.md']).toBe('# Original');

      const updatedArtifact = createArtifact({
        ...artifact,
        content: '# Updated',
      });

      rerender({ artifact: updatedArtifact });

      expect(result.current.files['content.md']).toBe('# Updated');
    });
  });

  describe('mermaid artifacts', () => {
    it('should handle mermaid type with content.md as fileKey', () => {
      const artifact = createArtifact({
        type: 'application/vnd.mermaid',
        content: 'graph TD\n  A-->B',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('diagram.mmd');
      expect(result.current.template).toBe('react-ts');
    });
  });

  describe('react artifacts', () => {
    it('should handle react type with App.tsx as fileKey', () => {
      const artifact = createArtifact({
        type: 'application/vnd.react',
        content: 'export default () => <div>Test</div>',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('App.tsx');
      expect(result.current.template).toBe('react-ts');
    });
  });

  describe('html artifacts', () => {
    it('should handle html type with index.html as fileKey', () => {
      const artifact = createArtifact({
        type: 'text/html',
        content: '<html><body>Test</body></html>',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('index.html');
      expect(result.current.template).toBe('static');
    });
  });

  describe('edge cases', () => {
    it('should handle artifact with language parameter', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        language: 'en',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.files['content.md']).toBe('# Test');
    });

    it('should handle artifact with undefined type', () => {
      const artifact = createArtifact({
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.template).toBe('static');
    });
  });

  describe('CODE artifacts', () => {
    /* The CODE bucket reuses the static markdown pipeline — `marked`
     * renders the wrapped fenced block as `<pre><code class="language-X">…`.
     * These tests pin the wrap-then-render shape end-to-end so a future
     * highlighter swap-in or CDN bump can't silently break the panel
     * for code files. */
    it('routes CODE artifacts to content.md / static template (markdown pipeline)', () => {
      const artifact = createArtifact({
        type: TOOL_ARTIFACT_TYPES.CODE,
        title: 'simple_graph.py',
        content: 'import matplotlib\nplt.savefig("foo.png")',
      });
      const { result } = renderHook(() => useArtifactProps({ artifact }));
      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.template).toBe('static');
    });

    it('wraps the source as a fenced block with the language hint from the filename', () => {
      const artifact = createArtifact({
        type: TOOL_ARTIFACT_TYPES.CODE,
        title: 'simple_graph.py',
        content: 'x = 1\nprint(x)',
      });
      const { result } = renderHook(() => useArtifactProps({ artifact }));
      const md = result.current.files['content.md'] as string;
      /* Marked outputs `<pre><code class="language-python">` from this fence. */
      expect(md.startsWith('```python\n')).toBe(true);
      expect(md.endsWith('\n```')).toBe(true);
      expect(md).toContain('x = 1');
      expect(md).toContain('print(x)');
    });

    it('falls back to the raw extension as language hint for unknown extensions', () => {
      const artifact = createArtifact({
        type: TOOL_ARTIFACT_TYPES.CODE,
        title: 'thing.qwerty',
        content: 'data',
      });
      const { result } = renderHook(() => useArtifactProps({ artifact }));
      const md = result.current.files['content.md'] as string;
      expect(md.startsWith('```qwerty\n')).toBe(true);
    });

    it('uses an empty language hint when the title has no extension', () => {
      const artifact = createArtifact({
        type: TOOL_ARTIFACT_TYPES.CODE,
        title: 'Makefile-style',
        content: 'all: build',
      });
      const { result } = renderHook(() => useArtifactProps({ artifact }));
      const md = result.current.files['content.md'] as string;
      /* Empty hint = bare ` ``` ` opener (no language token). */
      expect(md.startsWith('```\n')).toBe(true);
    });

    it('renders an index.html via the markdown template (visual parity with .md artifacts)', () => {
      const artifact = createArtifact({
        type: TOOL_ARTIFACT_TYPES.CODE,
        title: 'app.js',
        content: 'console.log("hi");',
      });
      const { result } = renderHook(() => useArtifactProps({ artifact }));
      const html = result.current.files['index.html'] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('marked.parse');
    });
  });
});

describe('wrapAsFencedCodeBlock', () => {
  it('wraps source with the supplied language hint', () => {
    expect(wrapAsFencedCodeBlock('print(1)', 'python')).toBe('```python\nprint(1)\n```');
  });

  it('emits a bare ``` opener when language is empty', () => {
    expect(wrapAsFencedCodeBlock('hello', '')).toBe('```\nhello\n```');
  });

  it('trims a single trailing newline so the closing fence stays flush', () => {
    /* Extractor output often ends with a newline; without trimming, the
     * closing ``` would appear on its own line after a blank gap and
     * marked would render an extra <br>. */
    expect(wrapAsFencedCodeBlock('a\nb\n', 'go')).toBe('```go\na\nb\n```');
    /* Only ONE trailing newline gets trimmed — preserves explicit blank
     * lines at end-of-file in the output. */
    expect(wrapAsFencedCodeBlock('a\nb\n\n', 'go')).toBe('```go\na\nb\n\n```');
  });

  it('handles empty source cleanly (renders an empty fenced block)', () => {
    expect(wrapAsFencedCodeBlock('', 'python')).toBe('```python\n\n```');
  });
});
