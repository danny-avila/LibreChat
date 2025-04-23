import React, { memo, useMemo, useRef, useEffect, useState } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkDirective from 'remark-directive';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { Pluggable } from 'unified';
import {
  useToastContext,
  ArtifactProvider,
  CodeBlockProvider,
  useCodeBlockContext,
} from '~/Providers';
import { Artifact, artifactPlugin } from '~/components/Artifacts/Artifact';
import { langSubset, preprocessLaTeX, handleDoubleClick } from '~/utils';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useFileDownload } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';
import CitationTooltip from './CitationTooltip';
import ReactDOM from 'react-dom';

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isSingleLine)).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isSingleLine) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return (
      <CodeBlock
        lang={lang ?? 'text'}
        codeChildren={children}
        blockIndex={blockIndex}
        allowExecution={canRunCode}
      />
    );
  }
});

export const codeNoExecution: React.ElementType = memo(({ className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (lang === 'math') {
    return children;
  } else if (typeof children === 'string' && children.split('\n').length === 1) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} allowExecution={false} />;
  }
});

type TAnchorProps = {
  href: string;
  children: React.ReactNode;
};

export const a: React.ElementType = memo(({ href, children }: TAnchorProps) => {
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const {
    file_id = '',
    filename = '',
    filepath,
  } = useMemo(() => {
    const pattern = new RegExp(`(?:files|outputs)/${user?.id}/([^\\s]+)`);
    const match = href.match(pattern);
    if (match && match[0]) {
      const path = match[0];
      const parts = path.split('/');
      const name = parts.pop();
      const file_id = parts.pop();
      return { file_id, filename: name, filepath: path };
    }
    return { file_id: '', filename: '', filepath: '' };
  }, [user?.id, href]);

  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', file_id);
  const props: { target?: string; onClick?: React.MouseEventHandler } = { target: '_new' };

  if (!file_id || !filename) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const stream = await downloadFile();
      if (stream.data == null || stream.data === '') {
        console.error('Error downloading file: No data found');
        showToast({
          status: 'error',
          message: localize('com_ui_download_error'),
        });
        return;
      }
      const link = document.createElement('a');
      link.href = stream.data;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(stream.data);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  props.onClick = handleDownload;
  props.target = '_blank';

  return (
    <a
      href={filepath.startsWith('files/') ? `/api/${filepath}` : `/api/files/${filepath}`}
      {...props}
    >
      {children}
    </a>
  );
});

type TParagraphProps = {
  children: React.ReactNode;
};

export const p: React.ElementType = memo(({ children }: TParagraphProps) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

const Markdown = memo(({ content = '', isLatestMessage }: TContentProps) => {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';
  const [tooltipData, setTooltipData] = useState({
    isVisible: false,
    citation: '',
    position: { x: 0, y: 0 },
    index: -1,
  });

  const markdownRef = useRef(null);

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);

  const processedContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
  
    const result = LaTeXParsing ? preprocessLaTeX(content) : content;
    if (!result) {
      return result;
    }
  
    return result.replace(/\[(\d+)\]/g, (match, refNumber) => {
      return `{{citation-ref:${refNumber}}}`;
    });
  }, [content, LaTeXParsing, isInitializing]);

  useEffect(() => {
    if (!markdownRef.current) {
      return;
    }
    // Trouver tous les nœuds de texte
    const walker = document.createTreeWalker(
      markdownRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }
    textNodes.forEach(textNode => {
      const text = textNode.nodeValue || '';
      if (text.includes('{{citation-ref:')) {
        const fragments = text.split(/(\{\{citation-ref:\d+\}\})/);
        if (fragments.length > 1) {
          const container = document.createElement('span');
          fragments.forEach(fragment => {
            const match = fragment.match(/\{\{citation-ref:(\d+)\}\}/);
            if (match) {
              const refNumber = match[1];
              const index = parseInt(refNumber, 10) - 1;
              const refBtn = document.createElement('button');
              refBtn.textContent = refNumber;
              refBtn.className = 'inline-flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full bg-gray-800 dark:bg-gray-700 text-white hover:bg-blue-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 mx-0.5';
              refBtn.style.minWidth = '20px';
              refBtn.dataset.citationIndex = refNumber;

              refBtn.addEventListener('mouseenter', (e) => {
                const citation = getCitationByIndex(index);
                if (citation) {
                  refBtn.classList.remove('bg-gray-800', 'dark:bg-gray-700');
                  refBtn.classList.add('bg-blue-800', 'dark:bg-blue-800');

                  setTooltipData({
                    isVisible: true,
                    citation,
                    position: { x: e.clientX, y: e.clientY },
                    index,
                  });
                }
              });
              refBtn.addEventListener('mouseleave', () => {
                refBtn.classList.remove('bg-blue-800', 'dark:bg-blue-800');
                refBtn.classList.add('bg-gray-800', 'dark:bg-gray-700');

                setTooltipData(prev => ({ ...prev, isVisible: false }));
              });
              refBtn.addEventListener('click', () => {
                const citation = getCitationByIndex(index);
                if (citation) {
                  window.open(citation, '_blank');
                }
              });
              container.appendChild(refBtn);
            } else {
              const textNode = document.createTextNode(fragment);
              container.appendChild(textNode);
            }
          });
          textNode.parentNode.replaceChild(container, textNode);
        }
      }
    });
    function getCitationByIndex(index) {
      const parent = markdownRef.current.closest('.message-render');
      if (!parent || !parent.id) {
        return null;
      }
      const messageId = parent.id;
      const message = findMessageById(messageId);
      if (message && message.citations && index >= 0 && index < message.citations.length) {
        return message.citations[index];
      }
      return null;
    }
    function findMessageById(messageId) {
      const messageElement = document.getElementById(messageId);
      if (!messageElement) {
        return null;
      }

      const citationsAttr = messageElement.getAttribute('data-citations');
      if (citationsAttr) {
        try {
          return { citations: JSON.parse(citationsAttr) };
        } catch (e) {
          console.error('Failed to parse citations data attribute', e);
        }
      }

      return null;
    }
  }, [processedContent]);

  const rehypePlugins = useMemo(
    () => [
      [rehypeKatex, { output: 'mathml' }],
      [
        rehypeHighlight,
        {
          detect: true,
          ignoreMissing: true,
          subset: langSubset,
        },
      ],
    ],
    [],
  );

  const remarkPlugins: Pluggable[] = useMemo(
    () => [
      supersub,
      remarkGfm,
      remarkDirective,
      artifactPlugin,
      [remarkMath, { singleDollarTextMath: true }],
    ],
    [],
  );

  if (isInitializing) {
    return (
      <div className="absolute">
        <p className="relative">
          <span className={isLatestMessage ? 'result-thinking' : ''} />
        </p>
      </div>
    );
  }

  return (
    <ArtifactProvider>
      <CodeBlockProvider>
        <div ref={markdownRef}>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /* @ts-ignore */
            rehypePlugins={rehypePlugins}
            components={
              {
                code,
                a,
                p,
                artifact: Artifact,
              } as {
                [nodeType: string]: React.ElementType;
              }
            }
          >
            {processedContent}
          </ReactMarkdown>
        </div>
        {ReactDOM.createPortal(
          <CitationTooltip
            citation={tooltipData.citation}
            isVisible={tooltipData.isVisible}
            position={tooltipData.position}
          />,
          document.body
        )}
      </CodeBlockProvider>
    </ArtifactProvider>
  );
});

export default Markdown;
