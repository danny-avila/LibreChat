import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
// import supersub from 'remark-supersub'
import remarkSubSuper from 'remark-sub-super';
import CodeBlock from './CodeBlock';
import { langSubset } from '~/utils/languages';

const Content = React.memo(({ content }) => {
  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }], remarkSubSuper]}
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
        renderers={{
          sub: 'sub',
          sup: 'sup',
        }}
        linkTarget="_new"
        components={{
          code,
          p,
          // em,
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
  return <span className="whitespace-pre-wrap mb-2">{props?.children}</span>;
});

const blinker = ({ node }) => {
  if (node.type === 'text' && node.value === '█') {
    return <span className="result-streaming">{node.value}</span>;
  }

  return null;
};

const em = React.memo(({ node, ...props }) => {
  if (
    props.children[0] &&
    typeof props.children[0] === 'string' &&
    props.children[0].startsWith('^')
  ) {
    return <sup>{props.children[0].substring(1)}</sup>;
  }
  if (
    props.children[0] &&
    typeof props.children[0] === 'string' &&
    props.children[0].startsWith('~')
  ) {
    return <sub>{props.children[0].substring(1)}</sub>;
  }
  return <i {...props} />;
});

export default Content;
