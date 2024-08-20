import React, { useRef, useState, RefObject, memo, useEffect } from 'react';

import copy from 'copy-to-clipboard';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import rehypeHighlight from 'rehype-highlight';
import { useDebounceCodeBlock } from './useDebounceCodeBlock';
import { handleDoubleClick, cn, langSubset } from '~/utils';
import Clipboard from '~/components/svg/Clipboard';
import CheckMark from '~/components/svg/CheckMark';
import useLocalize from '~/hooks/useLocalize';
import CodePreview from './CodePreview';

type CodeBarProps = {
  lang: string;
  codeRef: RefObject<HTMLElement>;
};

interface CodeBlockArtifactProps {
  lang: string;
  codeString: string;
  artifactId: string;
}
type CodeBlockProps = Pick<CodeBarProps, 'lang'> & {
  codeChildren: React.ReactNode;
  classProp?: string;
};

const CodeBar: React.FC<CodeBarProps> = React.memo(({ lang, codeRef }) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  return (
    <div className="relative flex items-center rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200 dark:bg-gray-700">
      <span className="">{lang}</span>
      <button
        type="button"
        className='ml-auto flex gap-2'
        onClick={async () => {
          const codeString = codeRef.current?.textContent;
          if (codeString != null) {
            setIsCopied(true);
            copy(codeString, { format: 'text/plain' });

            setTimeout(() => {
              setIsCopied(false);
            }, 3000);
          }
        }}
      >
        {isCopied ? (
          <>
            <CheckMark className="h-[18px] w-[18px]" />
            {localize('com_ui_copied')}
          </>
        ) : (
          <>
            <Clipboard />
            {localize('com_ui_copy_code')}
          </>
        )}
      </button>
    </div>
  );
});

const CodeBlock: React.FC<CodeBlockProps> = ({
  lang,
  codeChildren,
  classProp = '',
}) => {
  const codeRef = useRef<HTMLElement>(null);
  return (
    <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
      <CodeBar lang={lang} codeRef={codeRef} />
      <div className={cn(classProp, 'overflow-y-auto p-4')}>
        <code
          ref={codeRef}
          className={`hljs language-${lang} !whitespace-pre`}
        >
          {codeChildren}
        </code>
      </div>
    </div>
  );
};

export const CodeBlockArtifact: React.FC<CodeBlockArtifactProps> = ({ lang, codeString: content }) => {
  const debouncedUpdateCodeBlock = useDebounceCodeBlock();

  useEffect(() => {
    debouncedUpdateCodeBlock({
      id: `${lang}-${Date.now()}`,
      language: lang,
      content,
    });
  }, [lang, content, debouncedUpdateCodeBlock]);

  return (
    <CodePreview code={content} />
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
export const CodeMarkdown = memo(({ content = '', showCursor, isLatestMessage }: {
  content: string;
  showCursor?: boolean;
  isLatestMessage: boolean;
}) => {

  const currentContent = content;
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
  ];

  return (
    <ReactMarkdown
      rehypePlugins={rehypePlugins}
      linkTarget="_new"
      components={{ code }
      }
    >
      {isLatestMessage && showCursor === true ? currentContent + cursor : currentContent}
    </ReactMarkdown>
  );
});