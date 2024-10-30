import { PlusIcon } from 'lucide-react';
import React from 'react';
import { Button } from '~/components/ui';

type VectorStoreButtonProps = {
  onClick: () => void;
};

export default function VectorStoreButton({ onClick }: VectorStoreButtonProps) {
  return (
    <div className="w-full">
      <Button className="w-full bg-black p-0 text-white" onClick={onClick}>
        <PlusIcon className="h-4 w-4 font-bold" />
        &nbsp; <span className="text-nowrap">Add Store</span>
      </Button>
    </div>
  );
}
