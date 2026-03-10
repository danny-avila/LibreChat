import React, { memo, useEffect, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { handleDoubleClick, langSubset } from '~/utils';

type TCodeProps = {
  inline: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ inline, className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (inline) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  }

  return <code className={`hljs language-${lang} !whitespace-pre`}>{children}</code>;
});

export const CodeMarkdown = memo(
  ({ content = '', isSubmitting }: { content: string; isSubmitting: boolean }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [userScrolled, setUserScrolled] = useState(false);
    const currentContent = content;
    const rehypePlugins = [
      [rehypeKatex],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ];

    useEffect(() => {
      const scrollContainer = scrollRef.current;
      if (!scrollContainer) {
        return;
      }

      const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

        if (!isNearBottom) {
          setUserScrolled(true);
        } else {
          setUserScrolled(false);
        }
      };

      scrollContainer.addEventListener('scroll', handleScroll);

      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
      };
    }, []);

    useEffect(() => {
      const scrollContainer = scrollRef.current;
      if (!scrollContainer || !isSubmitting || userScrolled) {
        return;
      }

      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }, [content, isSubmitting, userScrolled]);

    return (
      <div ref={scrollRef} className="max-h-full overflow-y-auto">
        <ReactMarkdown
          /* @ts-ignore */
          rehypePlugins={rehypePlugins}
          components={
            { code } as {
              [key: string]: React.ElementType;
            }
          }
        >
          {currentContent}
        </ReactMarkdown>
      </div>
    );
  },
);
