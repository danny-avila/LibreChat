import { Button, TrashIcon } from '@librechat/client';
import React from 'react';

type DeleteIconButtonProps = {
  onClick: () => void;
};

export default function DeleteIconButton({ onClick }: DeleteIconButtonProps) {
  return (
    <div className="w-fit">
      <Button className="bg-red-400 p-3" onClick={onClick}>
        <TrashIcon />
      </Button>
    </div>
  );
}
