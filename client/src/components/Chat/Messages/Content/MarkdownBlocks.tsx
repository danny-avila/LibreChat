import React, { memo, useMemo, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import type { ElementType } from 'react';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import { splitMarkdownIntoBlocks } from './splitMarkdown';
import { createFadePlugin } from './animate';

type SharedProps = {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
  components: { [nodeType: string]: ElementType };
  animate?: boolean;
  hydrated?: boolean;
};

type MarkdownBlockProps = SharedProps & {
  content: string;
  codeBaseIndex: number;
  artifactBaseIndex: number;
  mermaidBaseIndex: number;
};

/**
 * Renders one top-level markdown block inside its own code/artifact providers,
 * seeded with the running index of executable code blocks and artifacts in
 * earlier blocks. Memoized on `content` and the base indices: a completed block
 * whose source slice and bases are unchanged across streamed tokens skips both
 * re-parsing and re-rendering, so only the final, still-growing block re-parses.
 */
const MarkdownBlock = memo(
  function MarkdownBlock({
    content,
    codeBaseIndex,
    artifactBaseIndex,
    mermaidBaseIndex,
    remarkPlugins,
    rehypePlugins,
    components,
    animate = false,
    hydrated = false,
  }: MarkdownBlockProps) {
    // One fade-plugin instance per block: its closure tracks this block's
    // character offsets so only newly streamed words animate. When `animate`
    // flips off at stream end, the plain plugin array renders the settled
    // block without wrapper spans. Classification is staged during render and
    // published after React commits, so abandoned renders leave no trace.
    // `hydrated` only matters at plugin creation (its first run), so it is
    // deliberately absent from the memo comparator and the useMemo deps.
    const fade = useMemo(
      () => (animate ? createFadePlugin(hydrated) : null),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [animate],
    );
    const blockRehypePlugins = useMemo(
      () => (fade == null ? rehypePlugins : [...rehypePlugins, fade.plugin]),
      [fade, rehypePlugins],
    );
    useLayoutEffect(() => {
      fade?.commit();
    });
    return (
      <ArtifactProvider baseIndex={artifactBaseIndex}>
        <CodeBlockProvider baseIndex={codeBaseIndex} mermaidBaseIndex={mermaidBaseIndex}>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /** @ts-ignore */
            rehypePlugins={blockRehypePlugins}
            components={components}
          >
            {content}
          </ReactMarkdown>
        </CodeBlockProvider>
      </ArtifactProvider>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.codeBaseIndex === next.codeBaseIndex &&
    prev.artifactBaseIndex === next.artifactBaseIndex &&
    prev.mermaidBaseIndex === next.mermaidBaseIndex &&
    prev.animate === next.animate,
);
MarkdownBlock.displayName = 'MarkdownBlock';

type MarkdownBlocksProps = SharedProps & {
  content: string;
};

/**
 * Splits a message into top-level blocks and renders each independently so
 * that, during streaming, only the last block re-parses while earlier blocks
 * (tables, code, etc.) stay memoized. Each block's executable code and artifact
 * indices are preserved in document order via per-block providers seeded with
 * prefix-summed base indices.
 */
const MarkdownBlocks = memo(function MarkdownBlocks({
  content,
  remarkPlugins,
  rehypePlugins,
  components,
  animate,
  hydrated,
}: MarkdownBlocksProps) {
  const blocks = useMemo(() => {
    let codeBaseIndex = 0;
    let artifactBaseIndex = 0;
    let mermaidBaseIndex = 0;
    return splitMarkdownIntoBlocks(content).map((block) => {
      const entry = { raw: block.raw, codeBaseIndex, artifactBaseIndex, mermaidBaseIndex };
      codeBaseIndex += block.codeBlockCount;
      artifactBaseIndex += block.artifactCount;
      mermaidBaseIndex += block.mermaidCount;
      return entry;
    });
  }, [content]);

  return (
    <>
      {blocks.map((block, index) => (
        // Key includes the base indices so that an in-place edit which inserts a
        // block before existing code/artifact blocks (shifting their base) forces
        // a remount, refreshing the index each code/artifact block captures in a
        // ref. During append-only streaming these stay constant, so completed
        // blocks keep a stable key and are not remounted.
        <MarkdownBlock
          key={`${index}-${block.codeBaseIndex}-${block.artifactBaseIndex}-${block.mermaidBaseIndex}`}
          content={block.raw}
          codeBaseIndex={block.codeBaseIndex}
          artifactBaseIndex={block.artifactBaseIndex}
          mermaidBaseIndex={block.mermaidBaseIndex}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
          animate={animate}
          hydrated={hydrated}
        />
      ))}
    </>
  );
});
MarkdownBlocks.displayName = 'MarkdownBlocks';

export default MarkdownBlocks;
