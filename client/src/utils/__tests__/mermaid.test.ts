import {
  fixSubgraphTitleContrast,
  sanitizeMermaidSvg,
  artifactFlowchartConfig,
  inlineFlowchartConfig,
  getMermaidFiles,
} from '~/utils/mermaid';

const makeSvg = (clusters: string): Element => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${clusters}</svg>`,
    'image/svg+xml',
  );
  return doc.querySelector('svg')!;
};

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

    it('does not inject custom themeVariables into generated component', () => {
      const darkFiles = getMermaidFiles(content, true);
      const lightFiles = getMermaidFiles(content, false);
      expect(darkFiles['/components/ui/MermaidDiagram.tsx']).not.toContain('themeVariables');
      expect(lightFiles['/components/ui/MermaidDiagram.tsx']).not.toContain('themeVariables');
    });

    it('handles empty content', () => {
      const files = getMermaidFiles('', true);
      expect(files['diagram.mmd']).toBe('# No mermaid diagram content provided');
    });
  });

  describe('fixSubgraphTitleContrast', () => {
    it('darkens title text on light subgraph backgrounds (fill attribute)', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#FFF9C4"/><g class="cluster-label"><text fill="#E0E0E0">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toContain('fill: #1a1a1a');
    });

    it('darkens title text on light subgraph backgrounds (inline style fill)', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect style="fill: #FFF9C4; stroke: #F9A825"/><g class="cluster-label"><text>Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toContain('fill: #1a1a1a');
    });

    it('lightens title text on dark subgraph backgrounds', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#1f2020"/><g class="cluster-label"><text fill="#222222">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toContain('fill: #f0f0f0');
    });

    it('leaves title text alone when contrast is already good', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#FFF9C4"/><g class="cluster-label"><text fill="#333333">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toBeNull();
    });

    it('skips clusters without a rect', () => {
      const svg = makeSvg(
        '<g class="cluster"><g class="cluster-label"><text fill="#E0E0E0">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toBeNull();
    });

    it('skips clusters with non-hex fills', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="rgb(255,249,196)"/><g class="cluster-label"><text fill="#E0E0E0">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toBeNull();
    });

    it('sets dark fill when text has no explicit fill on light backgrounds', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect style="fill:#FFF9C4"/><g class="cluster-label"><text>Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toContain('fill: #1a1a1a');
    });

    it('preserves existing text style when appending fill override', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#FFF9C4"/><g class="cluster-label"><text style="font-size: 14px" fill="#E0E0E0">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      const style = svg.querySelector('text')!.getAttribute('style')!;
      expect(style).toContain('font-size: 14px');
      expect(style).toContain('fill: #1a1a1a');
    });

    it('handles 3-char hex shorthand fills', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#FFC"/><g class="cluster-label"><text fill="#EEE">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      expect(svg.querySelector('text')!.getAttribute('style')).toContain('fill: #1a1a1a');
    });

    it('avoids double semicolons when existing style has trailing semicolon', () => {
      const svg = makeSvg(
        '<g class="cluster"><rect fill="#FFF9C4"/><g class="cluster-label"><text style="font-size: 14px;" fill="#E0E0E0">Title</text></g></g>',
      );
      fixSubgraphTitleContrast(svg);
      const style = svg.querySelector('text')!.getAttribute('style')!;
      expect(style).not.toContain(';;');
      expect(style).toContain('fill: #1a1a1a');
    });
  });

  describe('sanitizeMermaidSvg', () => {
    const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

    it('produces valid XML parseable as image/svg+xml', () => {
      const svg = wrap('<rect width="10" height="10"/>');
      const result = sanitizeMermaidSvg(svg);
      const doc = new DOMParser().parseFromString(result, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
    });

    it('preserves foreignObject and its HTML children', () => {
      const svg = wrap(
        '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hello</p></div></foreignObject>',
      );
      const result = sanitizeMermaidSvg(svg);
      expect(result).toContain('<foreignObject');
      expect(result).toContain('<p>Hello</p>');
    });

    it('serializes <br> as self-closing <br /> for XML compatibility', () => {
      const svg = wrap(
        '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><p>Line1<br/>Line2</p></div></foreignObject>',
      );
      const result = sanitizeMermaidSvg(svg);
      expect(result).toMatch(/<br\s*\/>/);
      expect(result).not.toMatch(/<br\s*>/);
    });

    it('retains xmlns="http://www.w3.org/2000/svg" on the root svg element', () => {
      const svg = wrap('<rect width="10" height="10"/>');
      const result = sanitizeMermaidSvg(svg);
      expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('strips script tags from SVG', () => {
      const svg = wrap('<script>alert("xss")</script><rect width="10" height="10"/>');
      const result = sanitizeMermaidSvg(svg);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    it('strips event handler attributes', () => {
      const svg = wrap('<rect width="10" height="10" onclick="alert(1)"/>');
      const result = sanitizeMermaidSvg(svg);
      expect(result).not.toContain('onclick');
    });

    it('strips script tags inside foreignObject HTML', () => {
      const svg = wrap(
        '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><script>alert("xss")</script><p>Safe</p></div></foreignObject>',
      );
      const result = sanitizeMermaidSvg(svg);
      expect(result).not.toContain('<script');
      expect(result).toContain('Safe');
    });

    it('strips javascript: URLs in foreignObject HTML', () => {
      const svg = wrap(
        '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml"><a href="javascript:alert(1)">click</a></div></foreignObject>',
      );
      const result = sanitizeMermaidSvg(svg);
      expect(result).not.toContain('javascript:');
    });

    it('preserves mermaid-specific attributes on SVG elements', () => {
      const svg = wrap('<text dominant-baseline="middle" text-anchor="start">label</text>');
      const result = sanitizeMermaidSvg(svg);
      expect(result).toContain('dominant-baseline');
      expect(result).toContain('text-anchor');
    });

    it('preserves styled span and class names inside foreignObject', () => {
      const svg = wrap(
        '<foreignObject width="150" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell;"><span class="nodeLabel"><p>Node text<br/>second line</p></span></div></foreignObject>',
      );
      const result = sanitizeMermaidSvg(svg);
      expect(result).toContain('nodeLabel');
      expect(result).toContain('Node text');
      expect(result).toContain('second line');
      expect(result).toMatch(/<br\s*\/>/);
    });
  });
});
