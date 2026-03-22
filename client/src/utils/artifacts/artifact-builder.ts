import { buildMarkdownDoc } from './renderers/markdown-renderer';
import { buildMermaidDoc } from './renderers/mermaid-renderer';
import { buildReactDoc } from './renderers/react-renderer';
import { buildHtmlDoc } from './renderers/html-renderer';
import { buildSvgDoc } from './renderers/svg-renderer';
import { isMermaidFile, isHtmlFile, isMarkdownFile, isSvgFile } from './helpers';

export interface RenderConfig {
  fileName: string;
  code: string;
  files: Record<string, string>;
  isDarkMode?: boolean;
}

type Renderer = {
  id: 'html' | 'svg' | 'mermaid' | 'markdown' | 'react';
  test: (cfg: RenderConfig) => boolean;
  render: (cfg: RenderConfig) => string;
};

const RENDERERS: Renderer[] = [
  { id: 'html', test: ({ fileName }) => isHtmlFile(fileName), render: ({ code, isDarkMode }) => buildHtmlDoc(code, !!isDarkMode) },
  { id: 'svg', test: ({ fileName, code }) => isSvgFile(fileName, code), render: ({ code, isDarkMode }) => buildSvgDoc(code, !!isDarkMode) },
  { id: 'mermaid', test: ({ fileName, code }) => isMermaidFile(fileName, code), render: ({ code, isDarkMode }) => buildMermaidDoc(code, !!isDarkMode) },
  { id: 'markdown', test: ({ fileName }) => isMarkdownFile(fileName), render: ({ code, isDarkMode }) => buildMarkdownDoc(code, !!isDarkMode) },
  { id: 'react', test: () => true, render: (cfg) => buildReactDoc(cfg) },
];

export function buildArtifactHtml(config: RenderConfig): string {
  return (RENDERERS.find(r => r.test(config)) ?? RENDERERS[RENDERERS.length - 1]).render(config);
}