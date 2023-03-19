import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import { langSubset } from '~/utils/languages';

const Content = React.memo(({ content }) => {
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          [rehypeKatex, { output: 'mathml' }],
          [
            rehypeHighlight,
            {
              detect: true,
              ignoreMissing: true,
              subset: langSubset
            }
          ]
        ]}
        linkTarget="_new"
        components={{
          code,
          p,
          text: blinker,
          // li,
          // ul,
          // ol
        }}
      >
        {content}
      </ReactMarkdown>
    </>
  );
});

const code = React.memo((props) => {
  const { inline, className, children } = props;
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return (
      <CodeBlock
        lang={lang || 'text'}
        codeChildren={children}
      />
    );
  }
});

const p = React.memo((props) => {
  return <p className="whitespace-pre-wrap ">{props?.children}</p>;
});

const blinker = ({ node }) => {
  if (node.type === 'text' && node.value === '█') {
    return <span className="result-streaming">{node.value}</span>
  }
  
  return null;
}

export default Content;
