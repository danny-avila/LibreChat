import React, { useState } from 'react';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import {
  AuthSettings,
  SearchSettings,
  EmailSettings,
  SettingsDescriptions as desc,
} from './components';
import {
  useGetAppConfig,
  useUpdateAppConfigMutation,
  TAuthConfig,
  TEmailConfig,
  TAppConfig,
  TSearchConfig,
} from 'librechat-data-provider';

function Settings() {
  const appConfig = useGetAppConfig();
  const updateConfig = useUpdateAppConfigMutation();

  const [config, setConfig] = useState<TAppConfig | undefined>(appConfig.data);

  const [appTitle, setAppTitle] = useState<string>(config?.appTitle || '');

  const handleAuthSettingsUpdate = (settings: TAuthConfig) => {
    updateConfig.mutate(
      //@ts-ignore - app config is defined by this point
      {
        ...config,
        auth: settings,
      },
      {
        onSuccess: (data) => {
          setConfig(data);
          //show toast
        },
        onError: (error) => {
          //show toast
        },
      },
    );
  };

  const handleSearchSettingsUpdate = (settings: TSearchConfig) => {
    updateConfig.mutate(
      //@ts-ignore - app config is defined by this point
      {
        ...config,
        search: settings,
      },
      {
        onSuccess: (data) => {
          setConfig(data);
          //show toast
        },
        onError: (error) => {
          //show toast
        },
      },
    );
  };

  const handleEmailSettingsUpdate = (settings: TEmailConfig) => {
    updateConfig.mutate(
      //@ts-ignore - app config is defined by this point
      {
        ...config,
        email: settings,
      },
      {
        onSuccess: (data) => {
          setConfig(data);
          //show toast
        },
        onError: (error) => {
          //show toast
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-medium text-gray-600">Settings</h1>
      <hr />
      <Card title="General">
        <div className="flex flex-col gap-5">
          <span className="p-float-label">
            <InputText
              className="w-full"
              id="appName"
              type="text"
              value={appTitle}
              tooltip={desc.App.title}
              tooltipOptions={{ position: 'bottom' }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppTitle(e.target.value)}
            />
            <label htmlFor="appName">Application Title</label>
          </span>
        </div>
      </Card>
      <hr />
      <AuthSettings authConfig={config?.auth} onUpdateAuthSettings={handleAuthSettingsUpdate} />
      <hr />
      <SearchSettings
        searchConfig={config?.search}
        onUpdateSearchSettings={handleSearchSettingsUpdate}
      />
      <hr />
      <EmailSettings
        emailConfig={config?.email}
        onUpdateEmailSettings={handleEmailSettingsUpdate}
      />
    </div>
  );
}

export default Settings;
