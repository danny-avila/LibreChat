import React from 'react';
import { Button, TrashIcon } from '@librechat/client';
import type { TFile } from 'librechat-data-provider';

type FileListItemProps = {
  file: TFile;
  deleteFile: (id: string | undefined) => void;
  width?: string;
};

export default function FileListItem({ file, deleteFile, width = '400px' }: FileListItemProps) {
  return (
    <div className="w-100 my-3 mr-2 flex cursor-pointer flex-row rounded-md border border-0 bg-white p-4 transition duration-300 ease-in-out hover:bg-slate-200">
      <div className="flex w-1/2 flex-col justify-around align-middle">
        <strong>{file.filename}</strong>
        <p className="text-sm text-gray-500">{file.object}</p>
      </div>
      <div className="w-2/6 text-gray-500">
        <p>({file.bytes / 1000}KB)</p>
        <p className="text-sm">{file.createdAt?.toString()}</p>
      </div>
      <div className="flex w-1/6 justify-around">
        <Button
          className="my-0 ml-3 bg-transparent p-0 text-[#666666] hover:bg-slate-200"
          onClick={() => deleteFile(file._id)}
        >
          <TrashIcon className="m-0 p-0" />
        </Button>
      </div>
    </div>
  );
}
