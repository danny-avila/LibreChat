import dedent from 'dedent';

const markdownRenderer = dedent(`import React, { useEffect, useState } from 'react';
import Markdown from 'marked-react';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div
      className="markdown-body"
      style={{
        padding: '2rem',        
        margin: '1rem',
        minHeight: '100vh'
      }}
    >
      <Markdown gfm={true} breaks={true}>{content}</Markdown>
    </div>
  );
};

export default MarkdownRenderer;`);

const wrapMarkdownRenderer = (content: string) => {
  // Normalize indentation: convert 2-space indents to 4-space for proper nesting
  const normalizedContent = content.replace(/^( {2})(-|\d+\.)/gm, '    $2');

  // Escape backticks, backslashes, and dollar signs in the content
  const escapedContent = normalizedContent
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return dedent(`import React from 'react';
import MarkdownRenderer from '/components/ui/MarkdownRenderer';

const App = () => {
  return <MarkdownRenderer content={\`${escapedContent}\`} />;
};

export default App;
`);
};

const markdownCSS = `
/* GitHub Markdown CSS - Light theme base */
.markdown-body {
  -ms-text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  word-wrap: break-word;
  color: #24292f;
  background-color: #ffffff;
}

.markdown-body h1, .markdown-body h2 {
  border-bottom: 1px solid #d0d7de;
  margin: 0.6em 0;
}

.markdown-body h1 { font-size: 2em; margin: 0.67em 0; }
.markdown-body h2 { font-size: 1.5em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: 0.875em; }
.markdown-body h6 { font-size: 0.85em; }

.markdown-body ul, .markdown-body ol {
  list-style: revert !important;
  padding-left: 2em !important;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body ul { list-style-type: disc !important; }
.markdown-body ol { list-style-type: decimal !important; }
.markdown-body ul ul { list-style-type: circle !important; }
.markdown-body ul ul ul { list-style-type: square !important; }

.markdown-body li { margin-top: 0.25em; }

.markdown-body li:has(> input[type="checkbox"]) {
  list-style-type: none !important;
}

.markdown-body li > input[type="checkbox"] {
  margin-right: 0.75em;
  margin-left: -1.5em;
  vertical-align: middle;
  pointer-events: none;
  width: 16px;
  height: 16px;
}

.markdown-body .task-list-item {
  list-style-type: none !important;
}

.markdown-body .task-list-item > input[type="checkbox"] {
  margin-right: 0.75em;
  margin-left: -1.5em;
  vertical-align: middle;
  pointer-events: none;
  width: 16px;
  height: 16px;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  border-radius: 6px;
  background-color: rgba(175, 184, 193, 0.2);
  color: #24292f;
  font-family: ui-monospace, monospace;
  white-space: pre-wrap;
}

.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  border-radius: 6px;
  margin-top: 0;
  margin-bottom: 16px;
  background-color: #f6f8fa;
  color: #24292f;
}

.markdown-body pre code {
  display: inline-block;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  word-wrap: normal;
  background-color: transparent;
  border: 0;
}

.markdown-body a {
  text-decoration: none;
  color: #0969da;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
}

.markdown-body table thead {
  background-color: #f6f8fa;
}

.markdown-body table th, .markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #d0d7de;
}

.markdown-body blockquote {
  padding: 0 1em;
  border-left: 0.25em solid #d0d7de;
  margin: 0 0 16px 0;
  color: #57606a;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  border: 0;
  background-color: #d0d7de;
}

.markdown-body img {
  max-width: 100%;
  box-sizing: content-box;
}

/* Dark theme */
@media (prefers-color-scheme: dark) {
  .markdown-body {
    color: #c9d1d9;
    background-color: #0d1117;
  }

  .markdown-body h1, .markdown-body h2 {
    border-bottom-color: #21262d;
  }

  .markdown-body code {
    background-color: rgba(110, 118, 129, 0.4);
    color: #c9d1d9;
  }

  .markdown-body pre {
    background-color: #161b22;
    color: #c9d1d9;
  }

  .markdown-body a {
    color: #58a6ff;
  }

  .markdown-body table thead {
    background-color: #161b22;
  }

  .markdown-body table th, .markdown-body table td {
    border-color: #30363d;
  }

  .markdown-body blockquote {
    border-left-color: #3b434b;
    color: #8b949e;
  }

  .markdown-body hr {
    background-color: #21262d;
  }
}
`;

export const getMarkdownFiles = (content: string) => {
  return {
    'content.md': content || '# No content provided',
    'App.tsx': wrapMarkdownRenderer(content),
    'index.tsx': dedent(`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./markdown.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(<App />);
;`),
    '/components/ui/MarkdownRenderer.tsx': markdownRenderer,
    'markdown.css': markdownCSS,
  };
};
