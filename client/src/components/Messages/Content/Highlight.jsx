import React, { useState, useEffect } from 'react';
import Highlighter from 'react-highlight';
import hljs from 'highlight.js';
import { languages } from '~/utils/languages';

const Highlight = React.memo(({ language, code }) => {
  const [highlightedCode, setHighlightedCode] = useState(code);
  const lang = language ? language : 'javascript';

  useEffect(() => {
    setHighlightedCode(hljs.highlight(code, { language: lang }).value);
  }, [code, lang]);

  return (
    <pre>
      {!highlightedCode ? (
        // <code className={`hljs !whitespace-pre language-${lang ? lang: 'javascript'}`}>
        <Highlighter className={`hljs !whitespace-pre language-${lang ? lang : 'javascript'}`}>
          {code}
        </Highlighter>
      ) : (
        <code
          className={`hljs language-${lang}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      )}
    </pre>
  );
});

export default Highlight;

