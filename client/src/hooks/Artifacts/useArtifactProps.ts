import { useMemo } from 'react';
import { removeNullishValues } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { getKey, getProps, getTemplate, getArtifactFilename } from '~/utils/artifacts';
import { getMermaidFiles } from '~/utils/mermaid';
import { getMarkdownFiles } from '~/utils/markdown';

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  const [fileKey, files] = useMemo(() => {
    const key = getKey(artifact.type ?? '', artifact.language);
    const type = artifact.type ?? '';

    if (key.includes('mermaid')) {
      return ['diagram.mmd', getMermaidFiles(artifact.content ?? '')];
    }

    if (type === 'text/markdown' || type === 'text/md' || type === 'text/plain') {
      return ['content.md', getMarkdownFiles(artifact.content ?? '')];
    }

    const fileKey = getArtifactFilename(artifact.type ?? '', artifact.language);
    const files = removeNullishValues({
      [fileKey]: artifact.content,
    });
    return [fileKey, files];
  }, [artifact.type, artifact.content, artifact.language]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  return {
    files,
    fileKey,
    template,
    sharedProps,
  };
}
