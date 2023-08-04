import * as Tabs from '@radix-ui/react-tabs';
import React, { useCallback, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import { Switch } from '~/components';
import { atom } from 'recoil';
import { localize } from '~/localization/Translation';

export const reverseProxyIsActiveState = atom({
  key: 'reverseProxyIsActiveState',
  default: false,
});

export const reverseProxyUrlState = atom({
  key: 'reverseProxyUrlState',
  default: '', // Default URL is an empty string
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
      <div>{localize(lang, 'com_nav_reverse_proxy')}</div>
      <label htmlFor="ReverseProxy" className="ml-4">
        <Switch id="ReverseProxy" checked={isActive} onCheckedChange={onCheckedChange} />
      </label>
    </div>
  );
};

export const SetReverseProxyUrl = ({
  url,
  onChange,
}: {
  url: string;
  onChange: (url: string) => void;
}) => {
  const lang = useRecoilValue(store.lang);

  return (
    <div className="flex items-center justify-between">
      <div>{localize(lang, 'com_nav_reverse_proxy_url')}</div>
      <input
        type="text"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-gray-600 focus:border-blue-300 focus:outline-none focus:ring dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        placeholder={localize(lang, 'com_nav_reverse_proxy_request')}
        style={{ width: '70%' }}
      />
    </div>
  );
};

function Api() {
  const [ReverseProxyIsActive, setReverseProxyIsActive] = useRecoilState(reverseProxyIsActiveState);
  const [url, setUrl] = useRecoilState(reverseProxyUrlState);

  const handleReverseProxyActivityChange = useCallback(
    (value: boolean) => {
      setReverseProxyIsActive(value);
    },
    [setReverseProxyIsActive],
  );

  const handleReverseProxyUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
    },
    [setUrl],
  );

  return (
    <Tabs.Content value="api" role="tabpanel" className="w-full md:min-h-[300px]">
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ToggleReverseProxy
            isActive={ReverseProxyIsActive}
            onCheckedChange={handleReverseProxyActivityChange}
          />
        </div>
        {ReverseProxyIsActive && (
          <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
            <SetReverseProxyUrl url={url} onChange={handleReverseProxyUrlChange} />
          </div>
        )}
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Api);
