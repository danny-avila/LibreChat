import * as Tabs from '@radix-ui/react-tabs';
import React, { useCallback } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import { Switch } from '~/components';
import { atom } from 'recoil';

export const reverseProxyIsActiveState = atom({
  key: 'reverseProxyIsActiveState',
  default: false,
});

export const ToggleReverseProxy = ({
  isActive,
  onCheckedChange,
}: {
  isActive: boolean;
  onCheckedChange: (value: boolean) => void;
}) => {
  const lang = useRecoilValue(store.lang);

  return (
    <div className="flex items-center justify-between">
      <div>{'ReverseProxy'}</div>
      <label htmlFor="ReverseProxy" className="ml-4">
        <Switch id="ReverseProxy" checked={isActive} onCheckedChange={onCheckedChange} />
      </label>
    </div>
  );
};

function Api() {
  const [ReverseProxyIsActive, setReverseProxyIsActive] = useRecoilState(reverseProxyIsActiveState);

  const handleReverseProxyActivityChange = useCallback(
    (value: boolean) => {
      setReverseProxyIsActive(value);
    },
    [setReverseProxyIsActive],
  );

  return (
    <Tabs.Content value="API" role="tabpanel" className="w-full md:min-h-[300px]">
      <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
        <ToggleReverseProxy
          isActive={ReverseProxyIsActive}
          onCheckedChange={handleReverseProxyActivityChange}
        />
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Api);
