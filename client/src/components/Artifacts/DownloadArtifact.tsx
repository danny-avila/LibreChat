import React, { useState } from 'react';
import { Download, CircleCheckBig } from 'lucide';
import { Button, MorphIcon } from '@librechat/client';
import type { Artifact } from '~/common';
import {
  useAttachmentLink,
  isLocallyStoredSource,
} from '~/components/Chat/Messages/Content/Parts/LogLink';
import { getArtifactDownloadFilename, isPreviewOnlyArtifact } from '~/utils/artifacts';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useCodeState } from '~/Providers/EditorContext';
import { useLocalize } from '~/hooks';

const DownloadArtifact = ({ artifact }: { artifact: Artifact }) => {
  const localize = useLocalize();
  const { currentCode } = useCodeState();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { fileKey: fileName } = useArtifactProps({ artifact });

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
  const downloadOriginalFile =
    hasUsableRoute && (isPreviewOnlyArtifact(artifact.type) || !hasEdits);
  const { handleDownload: downloadAttachment } = useAttachmentLink({
    href: download?.filepath ?? '',
    filename: download?.filename ?? artifact.title ?? fileName,
    file_id: download?.file_id,
    user: download?.user,
    source: download?.source,
  });

  const markDownloaded = () => {
    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 3000);
  };

  const downloadContent = () => {
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
      <MorphIcon icon={isDownloaded ? CircleCheckBig : Download} size={16} />
    </Button>
  );
};

export default DownloadArtifact;
