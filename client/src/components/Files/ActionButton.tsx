import React from 'react';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';

type ActionButtonProps = {
  onClick: () => void;
};

export default function ActionButton({ onClick }: ActionButtonProps) {
  const localize = useLocalize();
  return (
    <div className="w-32">
      <Button
        className="w-full rounded-md border border-black bg-white p-0 text-black hover:bg-black hover:text-white"
        onClick={onClick}
      >
        {/* Action Button */}
        {localize('com_ui_action_button')}
      </Button>
    </div>
  );
}
