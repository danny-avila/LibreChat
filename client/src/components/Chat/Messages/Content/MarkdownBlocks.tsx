import React, { memo, useMemo, useState, useLayoutEffect } from 'react';
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
  /** Whether this message is the one generating right now. */
  streaming: boolean;
};

type BlockEntry = {
  /**
   * Code and artifact blocks capture their index in a ref when they mount, so a
   * block has to remount whenever an index it holds could shift.
   */
  key: string;
  raw: string;
  codeBaseIndex: number;
  artifactBaseIndex: number;
  mermaidBaseIndex: number;
};

/**
 * Each top-level block, seeded with the code, artifact and Mermaid indices of the
 * blocks before it. The key carries those bases, so an in-place edit that inserts
 * a block before existing code or artifacts remounts the blocks it shifted, while
 * append-only streaming keeps completed blocks mounted.
 */
const toBlockEntries = (content: string): BlockEntry[] => {
  let codeBaseIndex = 0;
  let artifactBaseIndex = 0;
  let mermaidBaseIndex = 0;
  return splitMarkdownIntoBlocks(content).map((block, index) => {
    const entry = {
      key: `${index}-${codeBaseIndex}-${artifactBaseIndex}-${mermaidBaseIndex}`,
      raw: block.raw,
      codeBaseIndex,
      artifactBaseIndex,
      mermaidBaseIndex,
    };
    codeBaseIndex += block.codeBlockCount;
    artifactBaseIndex += block.artifactCount;
    mermaidBaseIndex += block.mermaidCount;
    return entry;
  });
};

/**
 * The whole message as one block, which numbers its code and artifacts from zero
 * itself. Keyed on its source, so an in-place edit remounts it and every index is
 * assigned afresh.
 */
const toWholeMessage = (content: string): BlockEntry[] =>
  content
    ? [{ key: content, raw: content, codeBaseIndex: 0, artifactBaseIndex: 0, mermaidBaseIndex: 0 }]
    : [];

/**
 * Renders a message's markdown.
 *
 * While the message streams, each top-level block renders and memoizes on its
 * own, so only the last, still-growing block re-parses on each token. Each
 * block's executable code and artifact indices stay in document order through
 * per-block providers seeded with prefix-summed base indices.
 *
 * A message that was never streamed in this view renders as one pipeline
 * instead. Splitting it would buy memoization nothing will use, at the price of
 * a whole extra parse to find block boundaries and one pipeline per block,
 * which is most of the cost of opening a long conversation. A message keeps the
 * split once it has streamed, so finishing an answer never remounts its blocks.
 */
const MarkdownBlocks = memo(function MarkdownBlocks({
  content,
  streaming,
  remarkPlugins,
  rehypePlugins,
  components,
  animate,
  hydrated,
}: MarkdownBlocksProps) {
  const [hasStreamed, setHasStreamed] = useState(streaming);
  if (streaming && !hasStreamed) {
    setHasStreamed(true);
  }
  const perBlock = streaming || hasStreamed;
  const blocks = useMemo(
    () => (perBlock ? toBlockEntries(content) : toWholeMessage(content)),
    [content, perBlock],
  );

  return (
    <>
      {blocks.map((block) => (
        <MarkdownBlock
          key={block.key}
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
