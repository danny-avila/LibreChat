import { CodeMarkdown } from './Code';
import type { Artifact } from '~/common';
import { getFileExtension } from '~/utils/artifacts';

export function ArtifactMarkdown({
  artifact,
  isSubmitting,
}: {
  artifact: Artifact;
  isSubmitting?: boolean;
}) {
  return (
    <CodeMarkdown
      content={`\`\`\`${getFileExtension(artifact.type)}\n${artifact.content ?? ''}\`\`\``}
      isSubmitting={!!isSubmitting}
    />
  );
}
