import React, { useRef, RefObject, memo } from 'react';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { handleDoubleClick, cn, langSubset } from '~/utils';

type CodeBarProps = {
  lang: string;
  codeRef: RefObject<HTMLElement>;
};

type CodeBlockProps = Pick<CodeBarProps, 'lang'> & {
  codeChildren: React.ReactNode;
  classProp?: string;
};

const CodeBlock: React.FC<CodeBlockProps> = ({ lang, codeChildren, classProp = '' }) => {
  const codeRef = useRef<HTMLElement>(null);
  return (
    <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
      <div className={cn(classProp, 'overflow-y-auto p-4')}>
        <code ref={codeRef} className={`hljs language-${lang} !whitespace-pre`}>
          {codeChildren}
        </code>
      </div>
    </div>
  );
};

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

  return <CodeBlock lang={lang ?? 'text'} codeChildren={children} />;
});

const cursor = ' ';
export const CodeMarkdown = memo(
  ({ content = '', showCursor }: { content: string; showCursor?: boolean }) => {
    const currentContent = content;
    const rehypePlugins = [
      [rehypeKatex, { output: 'mathml' }],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ];

    return (
      <ReactMarkdown
        /* @ts-ignore */
        rehypePlugins={rehypePlugins}
        // linkTarget="_new"
        components={
          { code } as {
            [key: string]: React.ElementType;
          }
        }
      >
        {showCursor === true ? currentContent + cursor : currentContent}
      </ReactMarkdown>
    );
  },
);
