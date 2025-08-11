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
  let contentEnd = artifactContent.lastIndexOf(ARTIFACT_END);

  // Special case: if contentEnd is 0, it means the only ::: found is at the start of :::artifact
  // This indicates an incomplete artifact (no closing :::)
  // We need to check that it's exactly at position 0 (the beginning of artifactContent)
  if (contentEnd === 0 && artifactContent.indexOf(ARTIFACT_START) === 0) {
    contentEnd = artifactContent.length;
  }

  if (contentStart === -1 || contentEnd === -1) {
    return null;
  }

  // Check if there are code blocks
  const codeBlockStart = artifactContent.indexOf('```\n', contentStart);
  const codeBlockEnd = artifactContent.lastIndexOf('\n```', contentEnd);

  // Determine where to look for the original content
  let searchStart, searchEnd;
  if (codeBlockStart !== -1) {
    // Code block starts
    searchStart = codeBlockStart + 4; // after ```\n

    if (codeBlockEnd !== -1 && codeBlockEnd > codeBlockStart) {
      // Code block has proper ending
      searchEnd = codeBlockEnd;
    } else {
      // No closing backticks found or they're before the opening (shouldn't happen)
      // This might be an incomplete artifact - search to contentEnd
      searchEnd = contentEnd;
    }
  } else {
    // No code blocks at all
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
