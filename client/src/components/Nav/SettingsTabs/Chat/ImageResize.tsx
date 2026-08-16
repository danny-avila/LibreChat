import { useSetRecoilState } from 'recoil';
import { Switch, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize, useClientResize } from '~/hooks';
import store from '~/store';

export default function ImageResize() {
  const localize = useLocalize();
  const setUserPreference = useSetRecoilState(store.clientImageResize);
  const { isEnabled, isEnforced } = useClientResize();

  const labelId = 'clientImageResize-label';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div id={labelId}>{localize('com_nav_client_image_resize')}</div>
        <InfoHoverCard
          side={ESide.Bottom}
          text={localize(
            isEnforced
              ? 'com_nav_info_client_image_resize_enforced'
              : 'com_nav_info_client_image_resize',
          )}
        />
      </div>
      <Switch
        id="clientImageResize"
        checked={isEnabled}
        onCheckedChange={setUserPreference}
        disabled={isEnforced}
        className="ml-4"
        data-testid="clientImageResize"
        aria-labelledby={labelId}
      />
    </div>
  );
}
