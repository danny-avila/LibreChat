import React, { useMemo } from 'react';
import type { Artifact } from '~/common';
import PDFViewer from './PDFViewer';

interface PDFArtifactProps {
  artifact: Artifact;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export default function PDFArtifact({
  artifact,
  initialPage = 1,
  onPageChange,
  className = '',
}: PDFArtifactProps) {
  // Extract file URL and metadata from artifact
  const { fileUrl, fileName, fileType } = useMemo(() => {
    // Get file ID and construct proper file URL
    const fileId = (artifact as any).fileId;
    const fileUrl = fileId ? `/api/files/${fileId}` : '';
    
    const fileName = 
      (artifact as any).filename || 
      (artifact as any).name || 
      'document.pdf';
    
    const fileType = 
      (artifact as any).fileType || 
      'application/pdf';
    
    return { fileUrl, fileName, fileType };
  }, [artifact]);

  if (!fileUrl) {
    return (
      <div className={`flex h-full items-center justify-center ${className}`}>
        <div className="text-center">
          <p className="text-text-secondary">No PDF file available</p>
        </div>
      </div>
    );
  }

  return (
    <PDFViewer
      fileUrl={fileUrl}
      fileName={fileName}
      initialPage={initialPage}
      onPageChange={onPageChange}
      className={className}
    />
  );
}
