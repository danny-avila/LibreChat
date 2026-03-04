import { inlineFlowchartConfig, artifactFlowchartConfig } from '~/utils/mermaid';
import { getMermaidFiles } from '~/utils/mermaid';

describe('mermaid config', () => {
  describe('flowchart config invariants', () => {
    it('inlineFlowchartConfig must have htmlLabels: false for blob URL <img> rendering', () => {
      expect(inlineFlowchartConfig.htmlLabels).toBe(false);
    });

    it('artifactFlowchartConfig must have htmlLabels: true for direct DOM injection', () => {
      expect(artifactFlowchartConfig.htmlLabels).toBe(true);
    });

    it('both configs share the same base layout settings', () => {
      expect(inlineFlowchartConfig.curve).toBe(artifactFlowchartConfig.curve);
      expect(inlineFlowchartConfig.nodeSpacing).toBe(artifactFlowchartConfig.nodeSpacing);
      expect(inlineFlowchartConfig.rankSpacing).toBe(artifactFlowchartConfig.rankSpacing);
      expect(inlineFlowchartConfig.padding).toBe(artifactFlowchartConfig.padding);
    });
  });

  describe('getMermaidFiles', () => {
    const content = 'graph TD\n  A-->B';

    it('produces dark theme files when isDarkMode is true', () => {
      const files = getMermaidFiles(content, true);
      expect(files['/components/ui/MermaidDiagram.tsx']).toContain('theme: "dark"');
      expect(files['mermaid.css']).toContain('#212121');
    });

    it('produces neutral theme files when isDarkMode is false', () => {
      const files = getMermaidFiles(content, false);
      expect(files['/components/ui/MermaidDiagram.tsx']).toContain('theme: "neutral"');
      expect(files['mermaid.css']).toContain('#FFFFFF');
    });

    it('defaults to dark mode when isDarkMode is omitted', () => {
      const files = getMermaidFiles(content);
      expect(files['/components/ui/MermaidDiagram.tsx']).toContain('theme: "dark"');
    });

    it('includes securityLevel in generated component', () => {
      const files = getMermaidFiles(content, true);
      expect(files['/components/ui/MermaidDiagram.tsx']).toContain('securityLevel: "strict"');
    });

    it('includes all required file keys', () => {
      const files = getMermaidFiles(content, true);
      expect(files['diagram.mmd']).toBe(content);
      expect(files['App.tsx']).toBeDefined();
      expect(files['index.tsx']).toBeDefined();
      expect(files['/components/ui/MermaidDiagram.tsx']).toBeDefined();
      expect(files['mermaid.css']).toBeDefined();
    });

    it('uses artifact flowchart config with htmlLabels: true', () => {
      const files = getMermaidFiles(content, true);
      expect(files['/components/ui/MermaidDiagram.tsx']).toContain('"htmlLabels": true');
    });

    it('handles empty content', () => {
      const files = getMermaidFiles('', true);
      expect(files['diagram.mmd']).toBe('# No mermaid diagram content provided');
    });
  });
});
