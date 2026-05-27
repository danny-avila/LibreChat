const ARTIFACT_START = ':::artifact';
const ARTIFACT_END = ':::';

const getLineEnd = (text, start) => {
  const index = text.indexOf('\n', start);
  return index === -1 ? text.length : index;
};

const getNextLineStart = (text, lineEnd) => (lineEnd >= text.length ? text.length : lineEnd + 1);

const getCloseLineEnd = (text, lineStart, lineEnd) => {
  const line = text.slice(lineStart, lineEnd);
  return line.trim() === ARTIFACT_END ? lineEnd : -1;
};

const getCodeFence = (line) => {
  const match = line.trimStart().match(/^(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  return {
    marker: match[1][0],
    length: match[1].length,
  };
};

const isClosingCodeFence = (line, openingFence) => {
  const closePattern = new RegExp(`^\\${openingFence.marker}{${openingFence.length},}\\s*$`);
  return closePattern.test(line.trim());
};

const findArtifactEnd = (text, start) => {
  const openingLineEnd = getLineEnd(text, start);
  let currentIndex = getNextLineStart(text, openingLineEnd);
  let codeFence = null;
  let fallbackEnd = -1;

  while (currentIndex < text.length) {
    const lineEnd = getLineEnd(text, currentIndex);
    const line = text.slice(currentIndex, lineEnd);
    const closeLineEnd = getCloseLineEnd(text, currentIndex, lineEnd);

    if (closeLineEnd !== -1) {
      if (!codeFence) {
        return closeLineEnd;
      }
      fallbackEnd = closeLineEnd;
    }

    const fence = getCodeFence(line);
    if (fence && !codeFence) {
      codeFence = fence;
    } else if (codeFence && isClosingCodeFence(line, codeFence)) {
      codeFence = null;
    }

    currentIndex = getNextLineStart(text, lineEnd);
  }

  return fallbackEnd !== -1 ? fallbackEnd : text.length;
};

const findLastArtifactCloseStart = (text, start, end) => {
  let currentIndex = start;
  let closeStart = -1;

  while (currentIndex < end) {
    const lineEnd = getLineEnd(text, currentIndex);
    if (getCloseLineEnd(text, currentIndex, lineEnd) !== -1) {
      closeStart = currentIndex;
    }
    currentIndex = getNextLineStart(text, lineEnd);
  }

  return closeStart;
};

const getOpeningCodeFence = (text, contentStart, contentEnd) => {
  const content = text.slice(contentStart, contentEnd);
  const firstContentMatch = content.match(/\S/);
  if (!firstContentMatch) {
    return null;
  }

  const fenceStart = contentStart + firstContentMatch.index;
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

const findClosingCodeFenceStart = (text, start, end, openingFence) => {
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

const getSearchRange = (artifactContent) => {
  const openingLineEnd = getLineEnd(artifactContent, artifactContent.indexOf(ARTIFACT_START));
  if (openingLineEnd >= artifactContent.length) {
    return null;
  }

  const contentStart = getNextLineStart(artifactContent, openingLineEnd);
  const lastCloseStart = findLastArtifactCloseStart(
    artifactContent,
    contentStart,
    artifactContent.length,
  );
  const contentEnd = lastCloseStart === -1 ? artifactContent.length : lastCloseStart;
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

const replaceRange = (originalText, start, end, updated) => {
  const endText = originalText.substring(end);
  const separator = endText.startsWith('\n') || updated.endsWith('\n') ? '' : '\n';
  return originalText.substring(0, start) + updated + separator + endText;
};

/**
 * Find all artifact boundaries in the message
 * @param {TMessage} message
 * @returns {Array<{start: number, end: number, source: 'content'|'text', partIndex?: number}>}
 */
const findAllArtifacts = (message) => {
  const artifacts = [];

  // Check content parts first
  if (message.content?.length) {
    message.content.forEach((part, partIndex) => {
      if (part.type === 'text' && typeof part.text === 'string') {
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
      }
    });
  }

  // Check message.text if no content parts
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

const replaceArtifactContent = (originalText, artifact, original, updated, options = {}) => {
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
    if (!options.replaceAllOnMissing) {
      return null;
    }
    const start = artifact.start + searchStart;
    const end = artifact.start + searchEnd;
    return replaceRange(originalText, start, end, updated).replace(/\n+(?=```\n:::)/g, '\n');
  }

  const absoluteIndex = artifact.start + searchStart + relativeIndex;
  return replaceRange(originalText, absoluteIndex, absoluteIndex + originalTrimmed.length, updated)
    .replace(/\n+(?=```\n:::)/g, '\n');
};

module.exports = {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
};
