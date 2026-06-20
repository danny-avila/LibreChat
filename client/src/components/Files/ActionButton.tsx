import React from 'react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

type ActionButtonProps = {
  onClick: () => void;
};

export default function ActionButton({ onClick }: ActionButtonProps) {
  const localize = useLocalize();
  return (
    <div className="w-32">
      <Button
        className="w-full rounded-md border border-text-primary bg-surface-primary p-0 text-text-primary hover:bg-primary hover:text-primary-foreground"
        onClick={onClick}
      >
        {/* Action Button */}
        {localize('com_ui_action_button')}
      </Button>
    </div>
  );
}
