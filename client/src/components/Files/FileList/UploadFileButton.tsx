import React from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@librechat/client';

type UploadFileProps = {
  onClick: () => void;
};

export default function UploadFileButton({ onClick }: UploadFileProps) {
  return (
    <div className="w-full">
      <Button className="w-full bg-black px-3 text-white" onClick={onClick}>
        <PlusIcon className="h-4 w-4 font-bold" />
        &nbsp; <span className="text-nowrap">Upload New File</span>
      </Button>
    </div>
  );
}
