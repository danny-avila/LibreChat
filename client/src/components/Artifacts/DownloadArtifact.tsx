import React, { useState } from 'react';
import { Download } from 'lucide-react';
import type { Artifact } from '~/common';
import { CheckMark } from '@librechat/client';
import useArtifactProps from '~/hooks/Artifacts/useArtifactProps';
import { useEditorContext } from '~/Providers';
import { useLocalize } from '~/hooks';

const DownloadArtifact = ({
  artifact,
  className = '',
}: {
  artifact: Artifact;
  className?: string;
}) => {
  const localize = useLocalize();
  const { currentCode } = useEditorContext();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const { fileKey: fileName } = useArtifactProps({ artifact });

  const handleDownload = () => {
    try {
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
      setIsDownloaded(true);
      setTimeout(() => setIsDownloaded(false), 3000);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <button
      className={`mr-2 text-text-secondary ${className}`}
      onClick={handleDownload}
      aria-label={localize('com_ui_download_artifact')}
    >
      {isDownloaded ? <CheckMark className="h-4 w-4" /> : <Download className="h-4 w-4" />}
    </button>
  );
};

export default DownloadArtifact;
