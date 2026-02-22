import { renderHook } from '@testing-library/react';
import useArtifactProps from '../useArtifactProps';
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
      expect(result.current.template).toBe('react-ts');
    });

    it('should handle text/plain type with content.md as fileKey', () => {
      const artifact = createArtifact({
        type: 'text/plain',
        content: '# Plain text as markdown',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.template).toBe('react-ts');
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

    it('should include App.tsx with wrapped markdown renderer', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.files['App.tsx']).toContain('MarkdownRenderer');
      expect(result.current.files['App.tsx']).toContain('import React from');
    });

    it('should include all required markdown files', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      // Check all required files are present
      expect(result.current.files['content.md']).toBeDefined();
      expect(result.current.files['App.tsx']).toBeDefined();
      expect(result.current.files['index.tsx']).toBeDefined();
      expect(result.current.files['/components/ui/MarkdownRenderer.tsx']).toBeDefined();
      expect(result.current.files['markdown.css']).toBeDefined();
    });

    it('should escape special characters in markdown content', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: 'Code: `const x = 1;`\nPath: C:\\Users',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      // Original content should be preserved in content.md
      expect(result.current.files['content.md']).toContain('`const x = 1;`');
      expect(result.current.files['content.md']).toContain('C:\\Users');

      // App.tsx should have escaped content
      expect(result.current.files['App.tsx']).toContain('\\`');
      expect(result.current.files['App.tsx']).toContain('\\\\');
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

    it('should provide marked-react dependency', () => {
      const artifact = createArtifact({
        type: 'text/markdown',
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      expect(result.current.sharedProps.customSetup?.dependencies).toHaveProperty('marked-react');
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

      // Update the artifact content
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

      // Language parameter should not affect markdown handling
      // It checks the type directly, not the key
      expect(result.current.fileKey).toBe('content.md');
      expect(result.current.files['content.md']).toBe('# Test');
    });

    it('should handle artifact with undefined type', () => {
      const artifact = createArtifact({
        content: '# Test',
      });

      const { result } = renderHook(() => useArtifactProps({ artifact }));

      // Should use default behavior
      expect(result.current.template).toBe('static');
    });
  });
});
