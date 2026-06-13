import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import type { ElementType } from 'react';
import { ArtifactProvider, CodeBlockProvider } from '~/Providers';
import { splitMarkdownIntoBlocks } from './splitMarkdown';

type SharedProps = {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
  components: { [nodeType: string]: ElementType };
};

type MarkdownBlockProps = SharedProps & {
  content: string;
  codeBaseIndex: number;
  artifactBaseIndex: number;
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
    remarkPlugins,
    rehypePlugins,
    components,
  }: MarkdownBlockProps) {
    return (
      <ArtifactProvider baseIndex={artifactBaseIndex}>
        <CodeBlockProvider baseIndex={codeBaseIndex}>
          <ReactMarkdown
            /** @ts-ignore */
            remarkPlugins={remarkPlugins}
            /** @ts-ignore */
            rehypePlugins={rehypePlugins}
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
    prev.artifactBaseIndex === next.artifactBaseIndex,
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
}: MarkdownBlocksProps) {
  const blocks = useMemo(() => {
    let codeBaseIndex = 0;
    let artifactBaseIndex = 0;
    return splitMarkdownIntoBlocks(content).map((block) => {
      const entry = { raw: block.raw, codeBaseIndex, artifactBaseIndex };
      codeBaseIndex += block.codeBlockCount;
      artifactBaseIndex += block.artifactCount;
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
          key={`${index}-${block.codeBaseIndex}-${block.artifactBaseIndex}`}
          content={block.raw}
          codeBaseIndex={block.codeBaseIndex}
          artifactBaseIndex={block.artifactBaseIndex}
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
        />
      ))}
    </>
  );
});
MarkdownBlocks.displayName = 'MarkdownBlocks';

export default MarkdownBlocks;
