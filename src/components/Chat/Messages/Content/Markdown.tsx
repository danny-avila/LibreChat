import { useRecoilValue } from 'recoil';
import React, { useState, useEffect } from 'react';
import type { TMessage } from 'librechat-data-provider';
import rehypeHighlight from 'rehype-highlight';
import type { PluggableList } from 'unified';
import ReactMarkdown from 'react-markdown';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import { langSubset, validateIframe, processLaTeX } from '~/utils';
import { useChatContext } from '~/Providers';
import store from '~/store';

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

const Markdown = React.memo(({ content, message, showCursor }: TContentProps) => {
  const [cursor, setCursor] = useState('█');
  const { isSubmitting, latestMessage } = useChatContext();
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);

  const isInitializing = content === '<span className="result-streaming">█</span>';

  const { isEdited, messageId } = message ?? {};
  const isLatestMessage = messageId === latestMessage?.messageId;

  const _content = content?.replace('z-index: 1;', '') ?? '';
  const currentContent = LaTeXParsing ? processLaTeX(_content) : _content;

  useEffect(() => {
    let timer1: NodeJS.Timeout, timer2: NodeJS.Timeout;

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

  let isValidIframe: string | boolean | null = false;
  if (!isEdited) {
    isValidIframe = validateIframe(currentContent);
  }

  if (isEdited || ((!isInitializing || !isLatestMessage) && !isValidIframe)) {
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

export default Markdown;
