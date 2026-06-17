import React, { useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Download, CircleCheckBig } from 'lucide-react';
import { Button } from '@librechat/client';
import type { Artifact } from '~/common';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useCodeState } from '~/Providers/EditorContext';
import { triggerDownload, logger } from '~/utils';
import { useFileDownload } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

const DownloadArtifact = ({ artifact }: { artifact: Artifact }) => {
  const localize = useLocalize();
  const user = useRecoilValue(store.user);
  const { currentCode } = useCodeState();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { fileKey: fileName } = useArtifactProps({ artifact });

  /* File-backed office previews (xlsx/docx/pptx from code execution) carry
   * the real server file id. Their `content` is only the rendered HTML
   * preview and `fileKey` is `index.html`, so a content-blob download would
   * hand the user an HTML file. Fetch the original binary instead via the
   * same endpoint the inline attachment chip uses. */
  const fileId = artifact.fileId;
  const { refetch: downloadFile } = useFileDownload(user?.id ?? '', fileId, { direct: false });

  const markDownloaded = useCallback(() => {
    setIsDownloaded(true);
    setTimeout(() => setIsDownloaded(false), 3000);
  }, []);

  const handleDownload = useCallback(async () => {
    if (fileId) {
      try {
        const result = await downloadFile();
        if (!result.data) {
          return;
        }
        triggerDownload(result.data, artifact.title ?? fileName);
        markDownloaded();
      } catch (error) {
        logger.error('[DownloadArtifact] File download failed:', error);
      }
      return;
    }

    try {
      const content = currentCode ?? artifact.content ?? '';
      if (!content) {
        return;
      }
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      triggerDownload(url, fileName);
      markDownloaded();
    } catch (error) {
      logger.error('[DownloadArtifact] Download failed:', error);
    }
  }, [fileId, downloadFile, currentCode, artifact.content, artifact.title, fileName, markDownloaded]);

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
