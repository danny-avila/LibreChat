import React from 'react';
import { RevokeKeysButton } from './RevokeKeysButton';
import { Label } from '~/components/ui';
import { useLocalize } from '~/hooks';

export const RevokeAllKeys = () => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <Label className="font-light">{localize('com_ui_revoke_info')}</Label>
      <RevokeKeysButton all={true} />
    </div>
  );
};
