import React, { useState } from 'react';
import { MultiSelect } from 'primereact/multiselect';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';

function Settings() {
  const [socialLoginEnabled, setSocialLoginEnabled] = useState<boolean>(false);
  const [isRegEnabled, setIsRegEnabled] = useState<boolean>(true);
  const [isGoogleEnabled, setIsGoogleEnabled] = useState<boolean>(false);
  const [isGithubEnabled, setIsGithubEnabled] = useState<boolean>(false);
  const [isDiscordEnabled, setIsDiscordEnabled] = useState<boolean>(false);
  const [isOpenIDEnabled, setIsOpenIDEnabled] = useState<boolean>(false);
  const [appTitle, setAppTitle] = useState<string>('LibreChat');
  const [databaseUri, setDatabaseUri] = useState<string>('mongodb://127.0.0.1:27018/LibreChat');
  const [proxy, setProxy] = useState<string>('');

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-medium text-gray-600">Settings</h1>
      <hr />
      <Card title="General">
        <div className="flex flex-col gap-2">
          <span className="p-float-label">
            <InputText
              className="w-full"
              id="appName"
              type="text"
              value={appTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppTitle(e.target.value)}
            />
            <label htmlFor="appName">Application Title</label>
          </span>
          <small id="appName-help">Enter the application title. Default is LibreChat</small>
        </div>
        <div className="flex flex-col gap-2">
          <span className="p-float-label">
            <InputText
              className="w-full"
              id="databaseUri"
              type="text"
              value={databaseUri}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDatabaseUri(e.target.value)}
            />
            <label htmlFor="appName">Database URI</label>
          </span>
          <small id="appName-help">Change this to your MongoDB URI if different.</small>
        </div>
        <div className="flex flex-col gap-2">
          <span className="p-float-label">
            <InputText
              className="w-full"
              id="proxy"
              type="text"
              value={proxy}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProxy(e.target.value)}
            />
            <label htmlFor="appName">Proxy</label>
          </span>
          <small id="appName-help">
            Useful if your machine has difficulty calling the original API server.
          </small>
        </div>
      </Card>
      <hr />
      <Card title="Registration & Authentication">
        <div className="flex flex-col gap-3">
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              checked={isRegEnabled}
              id="regEnabled"
              onChange={(e) => setIsRegEnabled(e.checked || false)}
            />
            <label className="ml-2" htmlFor="regEnabled">
              Enable Registration
            </label>
          </div>
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              checked={socialLoginEnabled}
              id="socialLoginEnabled"
              onChange={(e) => setSocialLoginEnabled(e.checked || false)}
            />
            <label htmlFor="socialLoginEnabled" className="ml-2">
              Enable social login
            </label>
          </div>
          {/* Google Login Settings */}
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              disabled={socialLoginEnabled ? false : true}
              checked={isGoogleEnabled}
              id="googleEnabled"
              onChange={(e) => setIsGoogleEnabled(e.checked || false)}
            />
            <label
              className={`ml-2 ${!socialLoginEnabled ? 'text-gray-400' : ''}`}
              htmlFor="googleEnabled"
            >
              Enable Google Login
            </label>
          </div>
          {isGoogleEnabled && (
            <div className="my-4 flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="googleClientId" type="text" />
                  <label htmlFor="googleClientId">Google Client ID</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="googleClientSecret" type="text" />
                  <label htmlFor="googleClientSecret">Google Client Secret</label>
                </span>
              </div>
            </div>
          )}
          {/* OpenID Login Settings */}
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              disabled={socialLoginEnabled ? false : true}
              checked={isOpenIDEnabled}
              id="openIdEnabled"
              onChange={(e) => setIsOpenIDEnabled(e.checked || false)}
            />
            <label
              className={`ml-2 ${!socialLoginEnabled ? 'text-gray-400' : ''}`}
              htmlFor="openIdEnabled"
            >
              Enable OpenID
            </label>
          </div>
          {isOpenIDEnabled && (
            <div className="flex flex-col gap-7">
              <div className="my-4 flex w-full gap-3">
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdClientId" type="text" />
                    <label htmlFor="openIdClientId">OpenID Client ID</label>
                  </span>
                </div>
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdClientSecret" type="text" />
                    <label htmlFor="openIdClientSecret">OpenID Client Secret</label>
                  </span>
                </div>
              </div>
              <div className="flex w-full gap-3">
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdIssuer" type="text" />
                    <label htmlFor="openIdIssuer">OpenID Issuer</label>
                  </span>
                </div>
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdSessionSecret" type="text" />
                    <label htmlFor="openIdSessionSecret">OpenID Session Secret</label>
                  </span>
                </div>
              </div>
              <div className="w-full">
                <span className="p-float-label">
                  <InputText className="w-full" id="openIdScope" type="text" />
                  <label htmlFor="openIdScope">OpenID Scope</label>
                </span>
              </div>
              <div className="flex w-full gap-3">
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdButtonLabel" type="text" />
                    <label htmlFor="openIdButtonLabel">OpenID Button Label</label>
                  </span>
                </div>
                <div className="w-1/2">
                  <span className="p-float-label">
                    <InputText className="w-full" id="openIdImageUrl" type="text" />
                    <label htmlFor="openIdImageUrl">OpenID Image URL</label>
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Github Login Settings */}
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              disabled={socialLoginEnabled ? false : true}
              checked={isGithubEnabled}
              id="githubEnabled"
              onChange={(e) => setIsGithubEnabled(e.checked || false)}
            />
            <label
              className={`ml-2 ${!socialLoginEnabled ? 'text-gray-400' : ''}`}
              htmlFor="githubEnabled"
            >
              Enable Github Login
            </label>
          </div>
          {isGithubEnabled && (
            <div className="my-4 flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="githubClientId" type="text" />
                  <label htmlFor="githubClientId">Github Client ID</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="githubClientSecret" type="text" />
                  <label htmlFor="githubClientSecret">Github Client Secret</label>
                </span>
              </div>
            </div>
          )}
          {/* Discord Login Settings */}
          <div className="align-items-center flex">
            <Checkbox
              className="pt-1"
              disabled={socialLoginEnabled ? false : true}
              checked={isDiscordEnabled}
              id="githubEnabled"
              onChange={(e) => setIsDiscordEnabled(e.checked || false)}
            />
            <label
              className={`ml-2 ${!socialLoginEnabled ? 'text-gray-400' : ''}`}
              htmlFor="discordEnabled"
            >
              Enable Discord Login
            </label>
          </div>
          {isDiscordEnabled && (
            <div className="my-4 flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="discordClientId" type="text" />
                  <label htmlFor="discordClientId">Discord Client ID</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText className="w-full" id="discordClientSecret" type="text" />
                  <label htmlFor="discordClientSecret">Discord Client Secret</label>
                </span>
              </div>
            </div>
          )}
        </div>
        <p className="text-semibold mt-5 text-sm text-gray-600">
          Note: JWT_SECRET, JWT_REFRESH_SECRET, and SESSION_EXPIRY should be set in a local .env
        </p>
      </Card>
      <hr />
      <Card title="Search"></Card>
    </div>
  );
}

export default Settings;
