const ARTIFACT_START = ':::artifact';
const ARTIFACT_END = ':::';

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
          const end = part.text.indexOf(ARTIFACT_END, start + ARTIFACT_START.length);
          artifacts.push({
            start,
            end: end !== -1 ? end + ARTIFACT_END.length : part.text.length,
            source: 'content',
            partIndex,
            text: part.text,
          });

          currentIndex = end !== -1 ? end + ARTIFACT_END.length : part.text.length;
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
      const end = message.text.indexOf(ARTIFACT_END, start + ARTIFACT_START.length);
      artifacts.push({
        start,
        end: end !== -1 ? end + ARTIFACT_END.length : message.text.length,
        source: 'text',
        text: message.text,
      });

      currentIndex = end !== -1 ? end + ARTIFACT_END.length : message.text.length;
      start = message.text.indexOf(ARTIFACT_START, currentIndex);
    }
  }

  return artifacts;
};

const replaceArtifactContent = (originalText, artifact, original, updated) => {
  const artifactContent = artifact.text.substring(artifact.start, artifact.end);

  // Find boundaries between ARTIFACT_START and ARTIFACT_END
  const contentStart = artifactContent.indexOf('\n', artifactContent.indexOf(ARTIFACT_START)) + 1;
  const contentEnd = artifactContent.lastIndexOf(ARTIFACT_END);

  if (contentStart === -1 || contentEnd === -1) {
    return null;
  }

  // Check if there are code blocks
  const codeBlockStart = artifactContent.indexOf('```\n', contentStart);
  const codeBlockEnd = artifactContent.lastIndexOf('\n```', contentEnd);

  // Determine where to look for the original content
  let searchStart, searchEnd;
  if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
    // If code blocks exist, search between them
    searchStart = codeBlockStart + 4; // after ```\n
    searchEnd = codeBlockEnd;
  } else {
    // Otherwise search in the whole artifact content
    searchStart = contentStart;
    searchEnd = contentEnd;
  }

  const innerContent = artifactContent.substring(searchStart, searchEnd);
  // Remove trailing newline from original for comparison
  const originalTrimmed = original.replace(/\n$/, '');
  const relativeIndex = innerContent.indexOf(originalTrimmed);

  if (relativeIndex === -1) {
    return null;
  }

  const absoluteIndex = artifact.start + searchStart + relativeIndex;
  const endText = originalText.substring(absoluteIndex + originalTrimmed.length);
  const hasTrailingNewline = endText.startsWith('\n');

  const updatedText =
    originalText.substring(0, absoluteIndex) + updated + (hasTrailingNewline ? '' : '\n') + endText;

  return updatedText.replace(/\n+(?=```\n:::)/g, '\n');
};

module.exports = {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
};
