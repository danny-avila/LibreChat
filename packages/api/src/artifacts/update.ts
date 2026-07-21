export const ARTIFACT_START = ':::artifact';
export const ARTIFACT_END = ':::';

type TextPart = {
  type?: string;
  text?: string;
};

type ArtifactMessage = {
  content?: TextPart[];
  text?: string;
};

export type ArtifactBoundary = {
  start: number;
  end: number;
  source: 'content' | 'text';
  partIndex?: number;
  text: string;
};

type ArtifactCloseRange = {
  start: number;
  end: number;
};

type CodeFence = {
  marker: string;
  length: number;
};

type SearchRange = {
  searchStart: number;
  searchEnd: number;
};

const getLineEnd = (text: string, start: number): number => {
  const index = text.indexOf('\n', start);
  return index === -1 ? text.length : index;
};

const getNextLineStart = (text: string, lineEnd: number): number =>
  lineEnd >= text.length ? text.length : lineEnd + 1;

const getCloseRange = (
  text: string,
  lineStart: number,
  lineEnd: number,
): ArtifactCloseRange | null => {
  const line = text.slice(lineStart, lineEnd);
  const contentStart = line.search(/\S/);
  if (contentStart === -1) {
    return null;
  }

  const markerStart = lineStart + contentStart;
  const markerText = text.slice(markerStart);
  if (!markerText.startsWith(ARTIFACT_END) || markerText.startsWith(ARTIFACT_START)) {
    return null;
  }

  return {
    start: markerStart,
    end: markerStart + ARTIFACT_END.length,
  };
};

const getCodeFence = (line: string): CodeFence | null => {
  const match = line.trimStart().match(/^(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  return {
    marker: match[1][0],
    length: match[1].length,
  };
};

const isClosingCodeFence = (line: string, openingFence: CodeFence): boolean => {
  const closePattern = new RegExp(`^\\${openingFence.marker}{${openingFence.length},}\\s*$`);
  return closePattern.test(line.trim());
};

const findArtifactClose = (text: string, start: number): ArtifactCloseRange | null => {
  const openingLineEnd = getLineEnd(text, start);
  let currentIndex = getNextLineStart(text, openingLineEnd);
  let codeFence: CodeFence | null = null;
  let fallbackClose: ArtifactCloseRange | null = null;

  while (currentIndex < text.length) {
    const lineEnd = getLineEnd(text, currentIndex);
    const line = text.slice(currentIndex, lineEnd);
    const closeRange = getCloseRange(text, currentIndex, lineEnd);

    if (closeRange) {
      if (!codeFence) {
        return closeRange;
      }
      fallbackClose = fallbackClose ?? closeRange;
    }

    const fence = getCodeFence(line);
    if (fence && !codeFence) {
      codeFence = fence;
    } else if (codeFence && isClosingCodeFence(line, codeFence)) {
      codeFence = null;
      fallbackClose = null;
    }

    currentIndex = getNextLineStart(text, lineEnd);
  }

  return codeFence ? fallbackClose : null;
};

const findArtifactEnd = (text: string, start: number): number => {
  return findArtifactClose(text, start)?.end ?? text.length;
};

const getOpeningCodeFence = (
  text: string,
  contentStart: number,
  contentEnd: number,
): (CodeFence & { contentStart: number }) | null => {
  const content = text.slice(contentStart, contentEnd);
  const firstContentMatch = content.match(/\S/);
  if (!firstContentMatch) {
    return null;
  }

  const fenceStart = contentStart + (firstContentMatch.index ?? 0);
  const lineEnd = getLineEnd(text, fenceStart);
  const line = text.slice(fenceStart, lineEnd);
  const fence = getCodeFence(line);

  if (!fence || !line.trimStart().startsWith(fence.marker.repeat(fence.length))) {
    return null;
  }

  return {
    ...fence,
    contentStart: getNextLineStart(text, lineEnd),
  };
};

const findClosingCodeFenceStart = (
  text: string,
  start: number,
  end: number,
  openingFence: CodeFence,
): number => {
  let currentIndex = start;

  while (currentIndex < end) {
    const lineEnd = getLineEnd(text, currentIndex);
    const line = text.slice(currentIndex, lineEnd);

    if (isClosingCodeFence(line, openingFence)) {
      return currentIndex;
    }

    currentIndex = getNextLineStart(text, lineEnd);
  }

  return -1;
};

const getSearchRange = (artifactContent: string): SearchRange | null => {
  const openingLineEnd = getLineEnd(artifactContent, artifactContent.indexOf(ARTIFACT_START));
  if (openingLineEnd >= artifactContent.length) {
    return null;
  }

  const contentStart = getNextLineStart(artifactContent, openingLineEnd);
  const artifactClose = findArtifactClose(artifactContent, 0);
  const contentEnd = artifactClose?.start ?? artifactContent.length;
  const openingFence = getOpeningCodeFence(artifactContent, contentStart, contentEnd);

  if (!openingFence) {
    return { searchStart: contentStart, searchEnd: contentEnd };
  }

  const closingFenceStart = findClosingCodeFenceStart(
    artifactContent,
    openingFence.contentStart,
    contentEnd,
    openingFence,
  );

  if (closingFenceStart === -1) {
    return { searchStart: openingFence.contentStart, searchEnd: contentEnd };
  }

  const closingLineEnd = getLineEnd(artifactContent, closingFenceStart);
  const trailingContent = artifactContent.slice(closingLineEnd, contentEnd);
  if (trailingContent.trim().length > 0) {
    return { searchStart: contentStart, searchEnd: contentEnd };
  }

  const searchEnd =
    artifactContent[closingFenceStart - 1] === '\n' ? closingFenceStart - 1 : closingFenceStart;
  return { searchStart: openingFence.contentStart, searchEnd };
};

const replaceRange = (
  originalText: string,
  start: number,
  end: number,
  updated: string,
): string => {
  const endText = originalText.substring(end);
  const separator = endText.startsWith('\n') || updated.endsWith('\n') ? '' : '\n';
  return originalText.substring(0, start) + updated + separator + endText;
};

const normalizeBeforeClosingArtifactFence = (text: string): string =>
  text.replace(/\n+(?=(?:`{3,}|~{3,})\s*\n\s*:::)/g, '\n');

export const findAllArtifacts = (message: ArtifactMessage): ArtifactBoundary[] => {
  const artifacts: ArtifactBoundary[] = [];

  if (message.content?.length) {
    message.content.forEach((part, partIndex) => {
      if (part.type !== 'text' || typeof part.text !== 'string') {
        return;
      }

      let currentIndex = 0;
      let start = part.text.indexOf(ARTIFACT_START, currentIndex);

      while (start !== -1) {
        const end = findArtifactEnd(part.text, start);
        artifacts.push({
          start,
          end,
          source: 'content',
          partIndex,
          text: part.text,
        });

        currentIndex = end;
        start = part.text.indexOf(ARTIFACT_START, currentIndex);
      }
    });
  }

  if (!artifacts.length && message.text) {
    let currentIndex = 0;
    let start = message.text.indexOf(ARTIFACT_START, currentIndex);

    while (start !== -1) {
      const end = findArtifactEnd(message.text, start);
      artifacts.push({
        start,
        end,
        source: 'text',
        text: message.text,
      });

      currentIndex = end;
      start = message.text.indexOf(ARTIFACT_START, currentIndex);
    }
  }

  return artifacts;
};

export const replaceArtifactContent = (
  originalText: string,
  artifact: ArtifactBoundary,
  original: string,
  updated: string,
): string | null => {
  const artifactContent = artifact.text.substring(artifact.start, artifact.end);
  const range = getSearchRange(artifactContent);
  if (!range) {
    return null;
  }

  const { searchStart, searchEnd } = range;
  const innerContent = artifactContent.substring(searchStart, searchEnd);
  const originalTrimmed = original.replace(/\n$/, '');
  const relativeIndex =
    originalTrimmed === '' && innerContent.trim().length > 0
      ? -1
      : innerContent.indexOf(originalTrimmed);

  if (relativeIndex === -1) {
    return null;
  }

  const absoluteIndex = artifact.start + searchStart + relativeIndex;
  return normalizeBeforeClosingArtifactFence(
    replaceRange(originalText, absoluteIndex, absoluteIndex + originalTrimmed.length, updated),
  );
};
