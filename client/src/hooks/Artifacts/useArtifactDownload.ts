import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artifact } from '~/common';
import {
  getArtifactDownloadFilename,
  getOriginalArtifactFilename,
  isPreviewOnlyArtifact,
  TOOL_ARTIFACT_TYPES,
} from '~/utils/artifacts';
import {
  useAttachmentLink,
  isLocallyStoredSource,
} from '~/components/Chat/Messages/Content/Parts/LogLink';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useCodeState } from '~/Providers/EditorContext';

export interface ArtifactDownload {
  /** Briefly true after a file actually reached the user, for the check-mark swap. */
  isDownloaded: boolean;
  handleDownload: (event: React.MouseEvent<HTMLElement>) => Promise<void>;
}

/**
 * Saves an artifact to disk, picking between the original file and the
 * (possibly edited) panel content.
 *
 * A hook rather than logic inside the download button because mermaid
 * artifacts expose the same action as an item in their export menu instead
 * of a second icon beside it — two entry points, one decision about what the
 * bytes should be.
 */
export default function useArtifactDownload(artifact: Artifact): ArtifactDownload {
  const { currentCode } = useCodeState();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { fileKey: fileName } = useArtifactProps({ artifact });
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  /* Unedited file-backed artifacts download the original: cached extraction
   * can be truncated or transformed. Edited content is exported as a blob. */
  const { download } = artifact;
  /* Only take the original-file branch when `useAttachmentLink` can
   * actually fetch something: a usable `filepath` (http target, share
   * route, or code-output URL) OR enough metadata for the local-file
   * API path (`isLocallyStoredSource` + file_id + user). A shared link
   * to a non-snapshotted code-execution artifact strips source/user and
   * deletes filepath while keeping file_id; without this guard that lone
   * file_id would route to an empty fetch and download nothing instead
   * of falling back to the preview-content blob. */
  const hasUsableRoute =
    (download?.filepath != null && download.filepath !== '') ||
    (download?.file_id != null &&
      download?.user != null &&
      isLocallyStoredSource(download?.source));
  const hasEdits = currentCode != null && currentCode !== artifact.content;
  /**
   * A mermaid artifact's content *is* its file — the panel renders the
   * diagram straight from it — so fetching the original adds nothing and
   * only introduces a way to fail: an expired code-output URL, a deleted
   * file or a share that dropped the route ends in "Error downloading
   * file" with the identical bytes sitting on screen. That is not the
   * office case, where the content is a lossy HTML render of a binary and
   * substituting it silently would be wrong.
   */
  const contentIsTheFile = artifact.type === TOOL_ARTIFACT_TYPES.MERMAID;
  const downloadOriginalFile =
    hasUsableRoute && !contentIsTheFile && (isPreviewOnlyArtifact(artifact.type) || !hasEdits);
  const { handleDownload: downloadAttachment } = useAttachmentLink({
    href: download?.filepath ?? '',
    filename: getOriginalArtifactFilename(artifact, fileName),
    file_id: download?.file_id,
    user: download?.user,
    source: download?.source,
  });

  const markDownloaded = useCallback(() => {
    setIsDownloaded(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsDownloaded(false), 3000);
  }, []);

  const handleDownload = useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      try {
        if (downloadOriginalFile) {
          // Only flag success when a file was actually delivered; the
          // attachment helper swallows fetch errors (e.g. an expired
          // code-output URL or a 404 share download) and resolves either way.
          const downloaded = await downloadAttachment(event);
          if (downloaded) {
            markDownloaded();
          }
          return;
        }
        const content = currentCode ?? artifact.content;
        if (content == null) {
          return;
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getArtifactDownloadFilename(artifact, fileName, content);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        markDownloaded();
      } catch (error) {
        console.error('Download failed:', error);
      }
    },
    [artifact, currentCode, downloadAttachment, downloadOriginalFile, fileName, markDownloaded],
  );

  return { isDownloaded, handleDownload };
}
