import React, { useState, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeBlock from './CodeBlock';
import store from '~/store';
import { langSubset } from '~/utils/languages.mjs';

const code = React.memo((props) => {
  const { inline, className, children } = props;
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return <CodeBlock lang={lang || 'text'} codeChildren={children} />;
  }
});

const p = React.memo((props) => {
  return <p className="mb-2 whitespace-pre-wrap">{props?.children}</p>;
});

const Content = React.memo(({ content, message }) => {
  const [cursor, setCursor] = useState('█');
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const latestMessage = useRecoilValue(store.latestMessage);
  const isInitializing = content === '<span className="result-streaming">█</span>';
  const isLatestMessage = message?.messageId === latestMessage?.messageId;

  useEffect(() => {
    let timer1, timer2;

    if (isSubmitting && isLatestMessage) {
      timer1 = setInterval(() => {
        setCursor('ㅤ');
        timer2 = setTimeout(() => {
          setCursor('█');
        }, 200);
      }, 1000);
    } else {
      setCursor('ㅤ');
    }

    // This is the cleanup function that React will run when the component unmounts
    return () => {
      clearInterval(timer1);
      clearTimeout(timer2);
    };
  }, [isSubmitting, isLatestMessage]);

  let rehypePlugins = [
    [rehypeKatex, { output: 'mathml' }],
    [
      rehypeHighlight,
      {
        detect: true,
        ignoreMissing: true,
        subset: langSubset,
      },
    ],
    [rehypeRaw],
  ];

  if (!isInitializing || !isLatestMessage) {
    //commented out to fix bing image creator errors
    //rehypePlugins.pop();
  }

  return (
    <ReactMarkdown
      remarkPlugins={[supersub, remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={rehypePlugins}
      linkTarget="_new"
      components={{
        code,
        p,
      }}
    >
      {isLatestMessage && isSubmitting && !isInitializing ? (content ?? '') + cursor : content}
    </ReactMarkdown>
  );
});

export default Content;
