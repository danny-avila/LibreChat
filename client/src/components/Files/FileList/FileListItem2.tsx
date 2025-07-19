import React from 'react';
import { FileIcon, PlusIcon } from 'lucide-react';
import { Button, DotsIcon, TrashIcon } from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import { useNavigate } from 'react-router-dom';

type FileListItemProps = {
  file: TFile;
  deleteFile: (id: string | undefined) => void;
  attachedVectorStores: { name: string }[];
};

export default function FileListItem2({
  file,
  deleteFile,
  attachedVectorStores,
}: FileListItemProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => {
        navigate('file_id_abcdef');
      }}
      className="w-100 mt-2 flex h-fit cursor-pointer flex-row rounded-md border border-0 bg-white p-4 transition duration-300 ease-in-out hover:bg-slate-200"
    >
      <div className="flex w-10/12 flex-col justify-around md:flex-row">
        <div className="flex w-2/5 flex-row">
          <div className="w-1/4 content-center">
            <FileIcon className="m-0 size-5 p-0" />
          </div>
          <div className="w-3/4 content-center">{file.filename}</div>
        </div>
        <div className="flex w-fit flex-row flex-wrap text-gray-500 md:w-3/5">
          {attachedVectorStores.map((vectorStore, index) => {
            if (index === 4) {
              return (
                <span
                  key={index}
                  className="ml-2 mt-1 flex flex-row items-center rounded-full bg-[#f5f5f5] px-2 text-xs"
                >
                  <PlusIcon className="h-3 w-3" />
                  &nbsp;
                  {attachedVectorStores.length - index} more
                </span>
              );
            }
            if (index > 4) {
              return null;
            }
            return (
              <span
                key={index}
                className="ml-2 mt-1 content-center rounded-full bg-[#f2f8ec] px-2 text-xs text-[#91c561]"
              >
                {vectorStore.name}
              </span>
            );
          })}
        </div>
      </div>
      <div className="mr-0 flex w-2/12 flex-col items-center justify-evenly sm:mr-4 md:flex-row">
        <Button className="w-min content-center bg-transparent text-gray-500 hover:bg-slate-200">
          <DotsIcon className="text-grey-100" />
        </Button>
        <Button
          className="w-min bg-transparent text-[#666666] hover:bg-slate-200"
          onClick={() => deleteFile(file._id)}
        >
          <TrashIcon className="" />
        </Button>
      </div>
    </div>
  );
}
