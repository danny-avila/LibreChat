import { TMessage } from 'librechat-data-provider';
import { useParams } from 'react-router-dom';
import { useGetMessagesByConvoId } from '../../../data-provider';
import { extractArtifacts, type ExtractedArtifact } from '../../../utils/extractArtifacts';
import ArtifactsTable from './ArtifactsTable';

export default function GeneratedArtifacts() {
  const { conversationId } = useParams();

  const { data: artifacts = [], isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: (data: TMessage[]) => {
      // Filter only messages that contain artifacts
      // DRAFT: only supports gemini artifacts
      const artifacts = data.reduce((artifacts, message) => {
        const content = message.content;
        if (content) {
          content.forEach((part) => {
            if (
              part.type === 'text' &&
              typeof part.text === 'string' &&
              part.text.includes(':::artifact')
            ) {
              artifacts.push(...extractArtifacts(part.text));
            }
          });
        }
        return artifacts;
      }, [] as ExtractedArtifact[]);

      return artifacts;
    },
    enabled: !!conversationId,
  });

  if (!artifacts || artifacts.length === 0) {
    return <div>No artifacts found</div>;
  }

  return (
    <div className="w-full pt-0 text-text-primary">
      <div className="mt-2 space-y-2">
        <ArtifactsTable artifacts={artifacts} />
      </div>
    </div>
  );
}
