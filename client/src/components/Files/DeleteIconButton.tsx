import React from 'react';
import { CrossIcon, TrashIcon } from '~/components/svg';
import { Button } from '~/components/ui';

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
