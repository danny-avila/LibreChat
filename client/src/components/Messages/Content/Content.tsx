import React, { useState, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeBlock from './CodeBlock';
import store from '~/store';
import { langSubset } from '~/utils';

type TCodeProps = {
  inline: boolean;
  className: string;
  children: React.ReactNode;
};

type TContentProps = {
  content: string;
  message: TMessage;
  showCursor?: boolean;
};

const code = React.memo(({ inline, className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return <CodeBlock lang={lang || 'text'} codeChildren={children} />;
  }
});

const p = React.memo(({ children }: { children: React.ReactNode }) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

const Content = React.memo(({ content, message, showCursor }: TContentProps) => {
  const [cursor, setCursor] = useState('█');
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const latestMessage = useRecoilValue(store.latestMessage);
  const isInitializing = content === '<span className="result-streaming">█</span>';
  const isLatestMessage = message?.messageId === latestMessage?.messageId;
  const currentContent = content?.replace('z-index: 1;', '') ?? '';
  const isIFrame = currentContent.includes('<iframe');

  useEffect(() => {
    let timer1, timer2;

    if (!showCursor) {
      setCursor('ㅤ');
      return;
    }

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
  }, [isSubmitting, isLatestMessage, showCursor]);

  const rehypePlugins: PluggableList = [
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

  if ((!isInitializing || !isLatestMessage) && !isIFrame) {
    rehypePlugins.pop();
  }

  return (
    <ReactMarkdown
      remarkPlugins={[supersub, remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={rehypePlugins}
      linkTarget="_new"
      components={
        {
          code,
          p,
        } as {
          [nodeType: string]: React.ElementType;
        }
      }
    >
      {isLatestMessage && isSubmitting && !isInitializing
        ? currentContent + cursor
        : currentContent}
    </ReactMarkdown>
  );
});

export default Content;
