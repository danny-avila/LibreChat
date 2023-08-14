import * as Tabs from '@radix-ui/react-tabs';
import React, { useCallback, useState } from 'react';
import { useRecoilState, atom } from 'recoil';
import { Switch } from '~/components';
import { useLocalize } from '~/hooks';
import { CheckMark, CrossIcon } from '~/components/svg/';
import { Eye, EyeOff } from 'lucide-react';
import store from '~/store';

export const reverseProxyIsActiveState = atom({
  key: 'reverseProxyIsActiveState',
  default: false,
});

export const reverseProxyUrlState = atom({
  key: 'reverseProxyUrlState',
  default: '',
});

export const reverseProxyApiState = atom({
  key: 'reverseProxyApiState',
  default: '',
});

export const EndpointMenu = ({
  endpoint,
  onChange,
}: {
  endpoint: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  const handleEndpointChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_endpoint_select')}</div>
      <select
        className="w-24 rounded border border-black/10 bg-transparent text-sm dark:border-white/20 dark:bg-gray-900"
        onChange={handleEndpointChange}
        value={endpoint}
      >
        <option value="openai">{localize('com_nav_endpoint_openai')}</option>
        <option value="azure">{localize('com_nav_endpoint_azure')}</option>
        <option value="plugin">{localize('com_nav_endpoint_plugin')}</option>
      </select>
    </div>
  );
};
export const ToggleReverseProxy = ({ isActive, onCheckedChange }) => {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_reverse_proxy')}</div>
      <label htmlFor="ReverseProxy" className="ml-4">
        <Switch id="ReverseProxy" checked={isActive} onCheckedChange={onCheckedChange} />
      </label>
    </div>
  );
};

export const SetReverseProxyUrl = ({ url, onChange }) => {
  const localize = useLocalize();

  const [tempUrl, setTempUrl] = useState(url);

  const handleUrlChange = useCallback((e) => {
    setTempUrl(e.target.value);
  }, []);

  const handleCrossClick = useCallback(() => {
    setTempUrl(url);
  }, [url]);

  const handleCorrectClick = useCallback(() => {
    onChange(tempUrl);
  }, [onChange, tempUrl]);

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_reverse_proxy_url')}</div>
      <div className="relative w-3/4">
        <input
          type="text"
          value={tempUrl}
          onChange={handleUrlChange}
          className="w-full rounded border border-gray-300 py-1 pl-2 pr-[36px] text-gray-600 focus:border-blue-300 focus:outline-none focus:ring dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          placeholder={localize('com_nav_reverse_proxy_url_request')}
        />
        {tempUrl !== url && (
          <>
            <button
              onClick={handleCrossClick}
              className="absolute right-9 top-1/2 -translate-y-1/2 transform text-red-500"
            >
              <CrossIcon />
            </button>
            <button
              onClick={handleCorrectClick}
              className="absolute right-3 top-1/2 -translate-y-1/2 transform text-green-500"
            >
              <CheckMark />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const SetReverseProxyApi = ({ api, onChange }) => {
  const localize = useLocalize();

  const [tempApi, setTempApi] = useState(api);
  const [showPassword, setShowPassword] = useState(false);

  const handleApiChange = useCallback((e) => {
    setTempApi(e.target.value);
  }, []);

  const handleCrossClick = useCallback(() => {
    setTempApi(api);
  }, [api]);

  const handleCorrectClick = useCallback(() => {
    onChange(tempApi);
  }, [onChange, tempApi]);

  const handleShowPasswordClick = useCallback(() => {
    setShowPassword(!showPassword);
  }, [showPassword]);

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_reverse_proxy_api')}</div>
      <div className="relative w-3/4">
        <input
          type={showPassword ? 'text' : 'password'}
          value={tempApi}
          onChange={handleApiChange}
          className="w-full rounded border border-gray-300 py-1 pl-2 pr-[36px] text-gray-600 focus:border-blue-300 focus:outline-none focus:ring dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          placeholder={localize('com_nav_reverse_proxy_api_request')}
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 transform gap-2">
          <button onClick={handleShowPasswordClick}>
            {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          {tempApi !== api && (
            <>
              <button onClick={handleCrossClick} className="text-red-500">
                <CrossIcon />
              </button>
              <button onClick={handleCorrectClick} className="text-green-500">
                <CheckMark />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function Api() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [endpoint, setEndpoint] = useRecoilState(store.endpoint);

  // Create an object to store settings for each endpoint
  const [endpointSettings, setEndpointSettings] = useState({
    openai: {
      reverseProxyIsActive: false,
      url: '',
      api: '',
    },
    azure: {
      reverseProxyIsActive: false,
      url: '',
      api: '',
    },
    plugin: {
      reverseProxyIsActive: false,
      url: '',
      api: '',
    },
  });

  const currentEndpointSettings = endpointSettings[endpoint];

  const handleReverseProxyActivityChange = useCallback(
    (value) => {
      setEndpointSettings((prevSettings) => ({
        ...prevSettings,
        [endpoint]: {
          ...prevSettings[endpoint],
          reverseProxyIsActive: value,
        },
      }));
    },
    [setEndpointSettings, endpoint],
  );

  const handleReverseProxyUrlChange = useCallback(
    (newUrl) => {
      setEndpointSettings((prevSettings) => ({
        ...prevSettings,
        [endpoint]: {
          ...prevSettings[endpoint],
          url: newUrl,
        },
      }));
    },
    [setEndpointSettings, endpoint],
  );

  const handleReverseProxyApiChange = useCallback(
    (newApi) => {
      setEndpointSettings((prevSettings) => ({
        ...prevSettings,
        [endpoint]: {
          ...prevSettings[endpoint],
          api: newApi,
        },
      }));
    },
    [setEndpointSettings, endpoint],
  );

  const handleShowApiKeyChange = useCallback(() => {
    setShowApiKey(!showApiKey);
  }, [showApiKey]);

  const changeEndpoint = useCallback(
    (value: string) => {
      setEndpoint(value);
    },
    [setEndpoint],
  );

  return (
    <Tabs.Content value="api" role="tabpanel" className="w-full md:min-h-[300px]">
      <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <EndpointMenu endpoint={endpoint} onChange={changeEndpoint} />
        </div>
        <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
          <ToggleReverseProxy
            isActive={currentEndpointSettings.reverseProxyIsActive}
            onCheckedChange={handleReverseProxyActivityChange}
          />
        </div>
        {currentEndpointSettings.reverseProxyIsActive && (
          <>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <SetReverseProxyUrl
                url={currentEndpointSettings.url}
                onChange={handleReverseProxyUrlChange}
              />
            </div>
            <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
              <SetReverseProxyApi
                api={currentEndpointSettings.api}
                onChange={handleReverseProxyApiChange}
                showApiKey={showApiKey}
                onShowApiKeyChange={handleShowApiKeyChange}
              />
            </div>
          </>
        )}
      </div>
    </Tabs.Content>
  );
}

export default React.memo(Api);
