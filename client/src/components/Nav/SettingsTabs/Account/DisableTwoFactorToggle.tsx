import React from 'react';
// import { motion } from 'framer-motion';
// import { LockIcon, UnlockIcon } from 'lucide-react';
import { Label, Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

interface DisableTwoFactorToggleProps {
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export const DisableTwoFactorToggle: React.FC<DisableTwoFactorToggleProps> = ({
  enabled,
  onChange,
  disabled,
  buttonRef,
}) => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Label> {localize('com_nav_2fa')}</Label>
      </div>
      <div className="flex items-center gap-3">
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
      </div>
    </div>
  );
};
