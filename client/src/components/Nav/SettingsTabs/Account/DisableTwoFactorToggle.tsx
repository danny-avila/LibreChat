import React from 'react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface DisableTwoFactorToggleProps {
  enabled: boolean;
  required?: boolean;
  onChange: () => void;
  disabled?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export const DisableTwoFactorToggle: React.FC<DisableTwoFactorToggleProps> = ({
  enabled,
  required,
  onChange,
  disabled,
  buttonRef,
}) => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-text-primary">{localize('com_nav_2fa')}</span>
      </div>
      <div className="flex items-center gap-3">
        {required && enabled ? (
          <span className="rounded-full bg-status-info-subtle px-3 py-1 text-sm font-medium text-status-info">
            {localize('com_ui_2fa_required')}
          </span>
        ) : (
          <Button
            ref={buttonRef}
            variant={enabled ? 'destructive' : 'outline'}
            onClick={onChange}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-controls="two-factor-authentication-dialog"
          >
            {enabled ? localize('com_ui_2fa_disable') : localize('com_ui_2fa_enable')}
          </Button>
        )}
      </div>
    </div>
  );
};
