import React, { memo, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import { getRemarkPlugins, getRehypePlugins, getMarkdownComponents } from './markdownConfig';
import { smoothStreamingAtom } from '~/store/smoothStreaming';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { useMessageContext } from '~/Providers';
import MarkdownBlocks from './MarkdownBlocks';
import { preprocessLaTeX } from '~/utils';
import store from '~/store';

type TContentProps = {
  content: string;
  isLatestMessage: boolean;
};

const Markdown = memo(function Markdown({ content = '', isLatestMessage }: TContentProps) {
  const { isSubmitting = false } = useMessageContext();
  const smoothStreaming = useAtomValue(smoothStreamingAtom);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const LaTeXParsing = useRecoilValue<boolean>(store.LaTeXParsing);
  const isInitializing = content === '';

  const currentContent = useMemo(() => {
    if (isInitializing) {
      return '';
    }
    return LaTeXParsing ? preprocessLaTeX(content) : content;
  }, [content, LaTeXParsing, isInitializing]);

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
    <MarkdownErrorBoundary content={content} codeExecution={true}>
      <MarkdownBlocks
        content={currentContent}
        remarkPlugins={getRemarkPlugins()}
        rehypePlugins={getRehypePlugins()}
        components={getMarkdownComponents()}
        animate={smoothStreaming && !reducedMotion && isLatestMessage && isSubmitting}
      />
    </MarkdownErrorBoundary>
  );
});
Markdown.displayName = 'Markdown';

export default Markdown;
