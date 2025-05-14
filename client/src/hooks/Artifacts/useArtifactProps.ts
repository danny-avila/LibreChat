import { useMemo } from 'react';
import { removeNullishValues } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { getKey, getProps, getTemplate, getArtifactFilename } from '~/utils/artifacts';
import { getMermaidFiles } from '~/utils/mermaid';

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  const [fileKey, files] = useMemo(() => {
    if (getKey(artifact.type ?? '', artifact.language).includes('mermaid')) {
      return ['App.tsx', getMermaidFiles(artifact.content ?? '')];
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
