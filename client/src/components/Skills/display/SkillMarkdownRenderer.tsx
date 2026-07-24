import { memo, useMemo, useCallback } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import rehypeHighlight from 'rehype-highlight';
import type { MouseEvent, AnchorHTMLAttributes } from 'react';
import type { PluggableList } from 'unified';
import { codeNoExecution } from '~/components/Chat/Messages/Content/MarkdownComponents';
import { isExternalSkillLink, splitHrefHash, resolveSkillRelativePath } from '../utils';
import { langSubset } from '~/utils';

const REMARK_PLUGINS: PluggableList = [
  supersub,
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];

const REHYPE_PLUGINS: PluggableList = [
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

interface SkillMarkdownRendererProps {
  content: string;
  className?: string;
  skillId?: string;
  currentFilePath?: string;
}

function SkillMarkdownRenderer({
  content,
  className,
  skillId,
  currentFilePath,
}: SkillMarkdownRendererProps) {
  const navigate = useNavigate();

  const handleSkillLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, target: string) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigate(target);
    },
    [navigate],
  );

  const components = useMemo(() => {
    const SkillLink = ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (!skillId || !href || isExternalSkillLink(href)) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      const { path, hash } = splitHrefHash(href);
      const resolved = resolveSkillRelativePath(path, currentFilePath);
      if (!resolved) {
        return (
          <a href={href} {...rest}>
            {children}
          </a>
        );
      }
      const target = `/skills/${skillId}?file=${encodeURIComponent(resolved)}${hash}`;
      return (
        <a href={target} onClick={(event) => handleSkillLinkClick(event, target)} {...rest}>
          {children}
        </a>
      );
    };

    return { code: codeNoExecution, a: SkillLink };
  }, [skillId, currentFilePath, handleSkillLinkClick]);

  return (
    <ReactMarkdown
      /** @ts-ignore - PluggableList vs Pluggable[] shape drift */
      remarkPlugins={REMARK_PLUGINS}
      /** @ts-ignore - PluggableList vs Pluggable[] shape drift */
      rehypePlugins={REHYPE_PLUGINS}
      components={components as unknown as Record<string, React.ElementType>}
      className={
        className ??
        'markdown prose dark:prose-invert light w-full break-words leading-[1.65rem] text-text-primary'
      }
    >
      {content}
    </ReactMarkdown>
  );
}

export default memo(SkillMarkdownRenderer);
