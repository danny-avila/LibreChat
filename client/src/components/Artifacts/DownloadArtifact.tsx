import React, { useState } from 'react';
import { Button } from '@librechat/client';
import { Download, CircleCheckBig } from 'lucide-react';
import type { Artifact } from '~/common';
import {
  useAttachmentLink,
  isLocallyStoredSource,
} from '~/components/Chat/Messages/Content/Parts/LogLink';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { isPreviewOnlyArtifact } from '~/utils/artifacts';
import { useCodeState } from '~/Providers/EditorContext';
import { useLocalize } from '~/hooks';

const DownloadArtifact = ({ artifact }: { artifact: Artifact }) => {
  const localize = useLocalize();
  const { currentCode } = useCodeState();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { fileKey: fileName } = useArtifactProps({ artifact });

  /* Office artifacts (pptx/xlsx/docx) render a server-generated HTML
   * preview in `content`, not the binary file — serializing that blob
   * would download the preview instead of the original. Fetch the real
   * file through the same path the inline card uses. Source-code and
   * text artifacts keep the blob path: their `content` IS the file (and
   * reflects any in-panel edits). */
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
  const downloadOriginalFile = isPreviewOnlyArtifact(artifact.type) && hasUsableRoute;
  const { handleDownload: downloadAttachment } = useAttachmentLink({
    href: download?.filepath ?? '',
    filename: artifact.title ?? fileName,
    file_id: download?.file_id,
    user: download?.user,
    source: download?.source,
  });

  const markDownloaded = () => {
    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 3000);
  };

  const downloadContent = () => {
    const content = currentCode ?? artifact.content ?? '';
    if (!content) {
      return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    markDownloaded();
  };

  const handleDownload = async (event: React.MouseEvent<HTMLButtonElement>) => {
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
      downloadContent();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-9 w-9"
      onClick={handleDownload}
      aria-label={localize('com_ui_download_artifact')}
    >
      {isDownloaded ? (
        <CircleCheckBig size={16} aria-hidden="true" />
      ) : (
        <Download size={16} aria-hidden="true" />
      )}
    </Button>
  );
};

export default DownloadArtifact;
