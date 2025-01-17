import React, { memo, useEffect, useRef, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import copy from 'copy-to-clipboard';
import { handleDoubleClick, langSubset } from '~/utils';
import Clipboard from '~/components/svg/Clipboard';
import CheckMark from '~/components/svg/CheckMark';
import useLocalize from '~/hooks/useLocalize';
import { SaveIcon } from '../svg';

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

export const CopyCodeButton: React.FC<{ content: string }> = ({ content }) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    copy(content, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <button
      className="mr-2 text-text-secondary"
      onClick={handleCopy}
      aria-label={isCopied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
    >
      {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
    </button>
  );
};

export const DownloadCodeButton: React.FC<{ content: string, fileName?: string, children?: React.ReactNode, className?: string }> = ({ content, fileName, children, className = '', }) => {
  const localize = useLocalize();
  const [isDownloaded, setIsDownloaded] = useState(false);

  const handleDownload = async () => {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName ?? 'code.txt',
        types: [
          {
            description: 'Text Files',
            accept: { 'text/plain': ['.txt'] },
          },
        ],
      });

      const writable = await fileHandle.createWritable();
      await writable.write(content);
      setIsDownloaded(true);
      await writable.close();
      setTimeout(() => setIsDownloaded(false), 3000);
    } catch (error) {
      console.error('File save canceled or failed:', error);
    }
  };

  return (
    <button
      className={`mr-2 text-text-secondary ${className}`}
      onClick={handleDownload}
      aria-label={isDownloaded ? localize('com_ui_saved') : localize('com_ui_save')}
    >
      {isDownloaded ? <CheckMark className="h-[18px] w-[18px]" /> : <SaveIcon size='1.5em' className='' />}
      {children}
    </button>
  );
};
