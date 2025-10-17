import React from 'react';
import type { TFile } from 'librechat-data-provider';
import FileListItem2 from './FileListItem2';
import FileListItem from './FileListItem';

type FileListProps = {
  files: TFile[];
  deleteFile: (id: string | undefined) => void;
  attachedVectorStores: { name: string }[];
};

export default function FileList({ files, deleteFile, attachedVectorStores }: FileListProps) {
  return (
    <div className="h-[85vh] overflow-y-auto">
      {files.map((file) => (
        // <FileListItem key={file._id} file={file} deleteFile={deleteFile} width="100%" />
        <FileListItem2
          key={file._id}
          file={file}
          deleteFile={deleteFile}
          attachedVectorStores={attachedVectorStores}
        />
      ))}
    </div>
  );
}
