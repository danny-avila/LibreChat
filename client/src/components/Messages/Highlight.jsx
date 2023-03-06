import React, { useState, useEffect } from 'react';
import hljs from 'highlight.js';

export default function Highlight({language, code}) {
  const [highlightedCode, setHighlightedCode] = useState(code);

  useEffect(() => {
    setHighlightedCode(hljs.highlight(code, { language }).value);
  }, [code, language]);

  return (
    <pre>
      <code className={`language-${language}`} dangerouslySetInnerHTML={{__html: highlightedCode}}/>
    </pre>
  );
}