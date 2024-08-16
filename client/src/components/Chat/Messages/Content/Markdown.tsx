import React, { memo, useMemo } from 'react';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import rehypeHighlight from 'rehype-highlight';
import { cn, langSubset, validateIframe, processLaTeX } from '~/utils';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import { useFileDownload } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import store from '~/store';

type TCodeProps = {
  inline: boolean;
  className?: string;
  children: React.ReactNode;
};

export const code = memo(({ inline, className, children }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return <CodeBlock lang={lang ?? 'text'} codeChildren={children} />;
  }
});

export const a = memo(({ href, children }: { href: string; children: React.ReactNode }) => {
  const user = useRecoilValue(store.user);
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const { file_id, filename, filepath } = useMemo(() => {
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
      if (!stream.data) {
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

export const p = memo(({ children }: { children: React.ReactNode }) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

const cursor = ' ';

type TContentProps = {
  content: string;
  isEdited?: boolean;
  showCursor?: boolean;
  isLatestMessage: boolean;
};

const Markdown = memo(({ content = '', isEdited, showCursor, isLatestMessage }: TContentProps) => {
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);

  const isInitializing = content === '';

  let currentContent = content;
  if (!isInitializing) {
    currentContent = currentContent.replace('z-index: 1;', '') || '';
    currentContent = LaTeXParsing ? processLaTeX(currentContent) : currentContent;
  }

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

  if (isInitializing) {
    rehypePlugins.pop();
    return (
      <div className="absolute">
        <p className="relative">
          <span className={cn(showCursor === true ? 'result-thinking' : '')} />
        </p>
      </div>
    );
  }

  let isValidIframe: string | boolean | null = false;
  if (isEdited !== true) {
    isValidIframe = validateIframe(currentContent);
  }

  if (isEdited === true || (!isLatestMessage && !isValidIframe)) {
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
          a,
          p,
        } as {
          [nodeType: string]: React.ElementType;
        }
      }
    >
      {isLatestMessage && showCursor === true ? currentContent + cursor : currentContent}
    </ReactMarkdown>
  );
});

export default Markdown;
