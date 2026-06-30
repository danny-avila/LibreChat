import React, { useState } from 'react';
import { Button } from '@librechat/client';
import { Download, CircleCheckBig } from 'lucide-react';
import type { Artifact } from '~/common';
import { useAttachmentLink } from '~/components/Chat/Messages/Content/Parts/LogLink';
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
  const downloadOriginalFile =
    isPreviewOnlyArtifact(artifact.type) &&
    (download?.filepath != null || download?.file_id != null);
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
        await downloadAttachment(event);
        markDownloaded();
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
