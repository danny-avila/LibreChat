import React from 'react';
import { motion } from 'framer-motion';
import { LockIcon, UnlockIcon } from 'lucide-react';
import { Label, Button } from '~/components';
import { useLocalize } from '~/hooks';

interface DisableTwoFactorToggleProps {
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export const DisableTwoFactorToggle: React.FC<DisableTwoFactorToggleProps> = ({
  enabled,
  onChange,
  disabled,
}) => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Label className="font-light"> {localize('com_nav_2fa')}</Label>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant={enabled ? 'destructive' : 'outline'}
          onClick={onChange}
          disabled={disabled}
        >
          {enabled ? localize('com_ui_2fa_disable') : localize('com_ui_2fa_enable')}
        </Button>
      </div>
    </div>
  );
};
