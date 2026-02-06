import React from 'react';
import { useRecoilState } from 'recoil';
import { Switch, Label, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function DisplayModelName() {
  const localize = useLocalize();
  const [ModelNameDisplay, setModelNameDisplay] = useRecoilState(store.ModelNameDisplay);

  const handleCheckedChange = (checked: boolean) => {
    setModelNameDisplay(checked);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <Label id="model-name-display-label">{localize('com_nav_model_name_display')}</Label>
        <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_model_name_display')} />
      </div>
      <Switch
        id="ModelNameDisplay"
        checked={ModelNameDisplay}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="ModelNameDisplay"
        aria-labelledby="model-name-display-label"
      />
    </div>
  );
}
