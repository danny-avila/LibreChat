import React from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@librechat/client';

type VectorStoreButtonProps = {
  onClick: () => void;
};

export default function VectorStoreButton({ onClick }: VectorStoreButtonProps) {
  return (
    <div className="w-full">
      <Button className="w-full bg-surface-inverted p-0 text-text-inverted" onClick={onClick}>
        <PlusIcon className="h-4 w-4 font-bold" />
        &nbsp; <span className="text-nowrap">Add Store</span>
      </Button>
    </div>
  );
}
