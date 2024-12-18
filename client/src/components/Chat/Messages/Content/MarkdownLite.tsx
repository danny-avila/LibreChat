import { memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import type { PluggableList } from 'unified';
import { code, codeNoExecution, a, p } from './Markdown';
import { CodeBlockProvider } from '~/Providers';
import { langSubset } from '~/utils';

const MarkdownLite = memo(
  ({ content = '', codeExecution = true }: { content?: string; codeExecution?: boolean }) => {
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
      <CodeBlockProvider>
        <ReactMarkdown
          remarkPlugins={[
            /** @ts-ignore */
            supersub,
            remarkGfm,
            [remarkMath, { singleDollarTextMath: true }],
          ]}
          /** @ts-ignore */
          rehypePlugins={rehypePlugins}
          // linkTarget="_new"
          components={
            {
              code: codeExecution ? code : codeNoExecution,
              a,
              p,
            } as {
              [nodeType: string]: React.ElementType;
            }
          }
        >
          {content}
        </ReactMarkdown>
      </CodeBlockProvider>
    );
  },
);

export default MarkdownLite;
