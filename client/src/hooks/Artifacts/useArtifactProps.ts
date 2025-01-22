import { useMemo } from 'react';
import { removeNullishValues } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { getKey, getProps, getTemplate, getArtifactFilename } from '~/utils/artifacts';
import { getMermaidFiles } from '~/utils/mermaid';

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  const files = useMemo(() => {
    if (getKey(artifact.type ?? '', artifact.language).includes('mermaid')) {
      return getMermaidFiles(artifact.content ?? '');
    }
    return removeNullishValues({
      [getArtifactFilename(artifact.type ?? '', artifact.language)]: artifact.content,
    });
  }, [artifact.type, artifact.content, artifact.language]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  return {
    files,
    template,
    sharedProps,
  };
}
