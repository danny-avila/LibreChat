import React, { useState, useEffect } from 'react';
import hljs from 'highlight.js';
import languages from '~/utils/languages';

export default function Highlight({language, code}) {
  const [highlightedCode, setHighlightedCode] = useState(code);
  const lang = languages.has(language) ? language : 'shell';

  useEffect(() => {
    setHighlightedCode(hljs.highlight(code, { language: lang }).value);
  }, [code, lang]);

  return (
    <pre>
      <code className={`language-${lang}`} dangerouslySetInnerHTML={{__html: highlightedCode}}/>
    </pre>
  );
}