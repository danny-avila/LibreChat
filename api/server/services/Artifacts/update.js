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
  const relativeIndex = artifactContent.indexOf(original);

  if (relativeIndex === -1) {
    return null;
  }

  const absoluteIndex = artifact.start + relativeIndex;
  const hasTrailingNewline = originalText
    .substring(absoluteIndex + original.length)
    .startsWith('\n');

  return (
    originalText.substring(0, absoluteIndex) +
    updated +
    (hasTrailingNewline ? '' : '\n') +
    originalText.substring(absoluteIndex + original.length)
  );
};

module.exports = {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
};
