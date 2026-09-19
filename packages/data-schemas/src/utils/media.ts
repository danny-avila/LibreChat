import type { MediaAsset } from 'librechat-data-provider';
import type { MediaAssetContent } from '~/types/media';

/** Public projection of a loaded media File. Original locations stay private to storage readers. */
export function toMediaAsset(
  content: MediaAsset & Partial<Pick<MediaAssetContent, 'source' | 'mediaRenditions'>>,
): MediaAsset {
  const contentPath = `/api/media/assets/${encodeURIComponent(content.file_id)}/content`;
  const renditions = content.mediaRenditions
    ? Object.fromEntries(
        Object.entries(content.mediaRenditions).map(([kind, rendition]) => [
          kind,
          {
            filepath: `${contentPath}?rendition=${kind}`,
            type: rendition.type,
            bytes: rendition.bytes,
            ...(rendition.width != null ? { width: rendition.width } : {}),
            ...(rendition.height != null ? { height: rendition.height } : {}),
            ...(rendition.durationSeconds != null
              ? { durationSeconds: rendition.durationSeconds }
              : {}),
          },
        ]),
      )
    : content.renditions;
  return {
    file_id: content.file_id,
    filename: content.filename,
    type: content.type,
    bytes: content.bytes,
    filepath: content.source ? contentPath : content.filepath,
    ...(renditions ? { renditions } : {}),
    ...(content.width != null ? { width: content.width } : {}),
    ...(content.height != null ? { height: content.height } : {}),
    ...(content.durationSeconds != null ? { durationSeconds: content.durationSeconds } : {}),
  };
}
