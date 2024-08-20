import React, { memo, RefObject, useMemo, useRef } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import { useRecoilValue } from 'recoil';
import { visit } from 'unist-util-visit';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { PluggableList, Pluggable } from 'unified';
import { langSubset, preprocessLaTeX, handleDoubleClick } from '~/utils';
import { CodeBlockArtifact, CodeMarkdown } from '~/components/Artifacts/Code';
import CodeBlock from '~/components/Messages/Content/CodeBlock';
import { useFileDownload } from '~/data-provider';
import { filenameMap } from '~/utils/artifacts';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import store from '~/store';

type TCodeProps = {
  inline: boolean;
  className?: string;
  children: React.ReactNode;
  isLatestMessage: boolean;
  showCursor?: boolean;
  artifactId: string;
  codeBlocksRef: RefObject<number | null>;
};

export const code: React.ElementType = memo(({ inline, className, children, ...props }: TCodeProps) => {
  const codeArtifacts = useRecoilValue(store.codeArtifacts);
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];

  if (inline) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  }

  const codeString = Array.isArray(children) ? children.join('') : children;
  console.log('code lang, children, props', lang, children, props);
  const isNonArtifact = filenameMap[lang ?? ''] === undefined;

  if (codeArtifacts && typeof codeString === 'string' && isNonArtifact) {
    return <CodeMarkdown content={`\`\`\`${lang}\n${codeString}\n\`\`\``} {...props}/>;
  } else if (codeArtifacts && typeof codeString === 'string') {
    return <CodeBlockArtifact lang={lang ?? 'text'} codeString={codeString} {...props}/>;
  }

  return <CodeBlock lang={lang ?? 'text'} codeChildren={children} />;
});

export const a: React.ElementType = memo(({ href, children }: { href: string; children: React.ReactNode }) => {
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

export const p: React.ElementType = memo(({ children }: { children: React.ReactNode }) => {
  return <p className="mb-2 whitespace-pre-wrap">{children}</p>;
});

const cursor = ' ';

type TContentProps = {
  content: string;
  showCursor?: boolean;
  isLatestMessage: boolean;
};

const Markdown = memo(({ content = '', showCursor, isLatestMessage }: TContentProps) => {
  const artifactIdRef = useRef<string | null>(null);
  const codeBlocksRef = useRef<number | null>(null);
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const codeArtifacts = useRecoilValue<boolean>(store.codeArtifacts);

  const isInitializing = content === '';

  let currentContent = content;
  if (!isInitializing) {
    currentContent = currentContent.replace('z-index: 1;', '') || '';
    currentContent = LaTeXParsing ? preprocessLaTeX(currentContent) : currentContent;
  }

  if (artifactIdRef.current === null) {
    artifactIdRef.current = new Date().toISOString();
  }

  const codePlugin: Pluggable = () => {
    return (tree) => {
      visit(tree, { tagName: 'code' }, (node) => {
        node.properties = {
          ...node.properties,
          isLatestMessage,
          showCursor,
          artifactId: artifactIdRef.current,
          codeBlocksRef: codeBlocksRef.current,
        };
      });
    };
  };

  const rehypePlugins: PluggableList = codeArtifacts ? [[rehypeKatex, { output: 'mathml' }], [codePlugin], [rehypeRaw]] : [
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
    <ReactMarkdown
      remarkPlugins={[supersub, remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={rehypePlugins}
      linkTarget="_new"
      components={
        {
          code,
          a,
          p,
        }
      }
    >
      {isLatestMessage && showCursor === true ? currentContent + cursor : currentContent}
    </ReactMarkdown>
  );
});

export default Markdown;
