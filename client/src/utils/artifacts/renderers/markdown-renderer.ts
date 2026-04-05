import { baseHtml } from '../templates';
import { DEPENDENCY_VERSIONS } from '../core';

export function buildMarkdownDoc(code: string, isDarkMode: boolean): string {
  const markdown = JSON.stringify(code || '');

  const head = `
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        background: ${isDarkMode ? '#0b0f19' : '#ffffff'};
        color: ${isDarkMode ? '#e5e7eb' : '#111827'};
      }
      .markdown {
        max-width: 900px;
        margin: 0 auto;
        line-height: 1.6;
      }
      .markdown h1, .markdown h2, .markdown h3 {
        margin: 1.2em 0 0.5em;
      }
      .markdown pre {
        background: ${isDarkMode ? '#111827' : '#f3f4f6'};
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
      }
      .markdown code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .markdown a { color: ${isDarkMode ? '#60a5fa' : '#2563eb'}; }
      .markdown blockquote {
        border-left: 4px solid ${isDarkMode ? '#374151' : '#e5e7eb'};
        margin: 1em 0;
        padding: 0.5em 1em;
        color-scheme: ${isDarkMode ? 'dark' : 'light'};
        background: ${isDarkMode ? '#111827' : '#f9fafb'};
      }
    </style>
  `;

  const body = `
    <div id="root" class="markdown"></div>
    <script type="module">
      import React from "https://esm.sh/react@${DEPENDENCY_VERSIONS.react}?dev";
      import { createRoot } from "https://esm.sh/react-dom@${DEPENDENCY_VERSIONS["react-dom"]}/client?dev";
      import ReactMarkdown from "https://esm.sh/react-markdown@${DEPENDENCY_VERSIONS["react-markdown"]}?dev";
      const md = ${markdown};
      const App = () => React.createElement(
        ReactMarkdown,
        { children: md }
      );
      createRoot(document.getElementById("root")).render(
        React.createElement(App)
      );
      window.parent.postMessage({ type: 'artifact-ready' }, '*');
    </script>
  `;

  return baseHtml({ head, body, isDarkMode });
}