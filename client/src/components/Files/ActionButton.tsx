import React from 'react';
import { CrossIcon } from '~/components/svg';
import { Button } from '~/components/ui';

type ActionButtonProps = {
  onClick: () => void;
};

export default function ActionButton({ onClick }: ActionButtonProps) {
  return (
    <div className="w-32">
      <Button
        className="w-full rounded-md border border-black bg-white p-0 text-black hover:bg-black hover:text-white"
        onClick={onClick}
      >
        Action Button
      </Button>
    </div>
  );
}
