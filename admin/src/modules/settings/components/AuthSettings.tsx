import { useState } from 'react';
import type { TAuthConfig } from 'librechat-data-provider';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { SettingsDescriptions as desc } from './SettingsDescriptions';

type TAuthSettingsProps = {
  authConfig: TAuthConfig | undefined;
  onUpdateAuthSettings: (authConfig: TAuthConfig) => void;
};

function AuthSettings({ authConfig, onUpdateAuthSettings }: TAuthSettingsProps) {
  const [isRegEnabled, setIsRegEnabled] = useState<boolean>(true);
  const [isGoogleEnabled, setIsGoogleEnabled] = useState<boolean>(
    authConfig?.googleLoginEnabled || false,
  );
  const [isGithubEnabled, setIsGithubEnabled] = useState<boolean>(
    authConfig?.githubLoginEnabled || false,
  );
  const [isDiscordEnabled, setIsDiscordEnabled] = useState<boolean>(
    authConfig?.discordLoginEnabled || false,
  );
  const [isOpenIDEnabled, setIsOpenIDEnabled] = useState<boolean>(
    authConfig?.openidLoginEnabled || false,
  );
  const [socialLoginEnabled, setSocialLoginEnabled] = useState<boolean>(
    authConfig?.socialLoginEnabled || false,
  );
  const [googleClientId, setGoogleClientId] = useState<string>(authConfig?.google.clientId || '');
  const [googleClientSecret, setGoogleClientSecret] = useState<string>(
    authConfig?.google.clientSecret || '',
  );
  const [githubClientId, setGithubClientId] = useState<string>(authConfig?.github.clientId || '');
  const [githubClientSecret, setGithubClientSecret] = useState<string>(
    authConfig?.github.clientSecret || '',
  );
  const [discordClientId, setDiscordClientId] = useState<string>(
    authConfig?.discord.clientId || '',
  );
  const [discordClientSecret, setDiscordClientSecret] = useState<string>(
    authConfig?.discord.clientSecret || '',
  );
  const [openidClientId, setOpenidClientId] = useState<string>(authConfig?.openid.clientId || '');
  const [openidClientSecret, setOpenidClientSecret] = useState<string>(
    authConfig?.openid.clientSecret || '',
  );
  const [openidIssuer, setOpenidIssuer] = useState<string>(authConfig?.openid.issuer || '');
  const [openIdSessionSecret, setOpenIdSessionSecret] = useState<string>(
    authConfig?.openid.sessionSecret || '',
  );
  const [openIdScope, setOpenIdScope] = useState<string>(authConfig?.openid.scope || '');
  const [openIdButtonLabel, setOpenIdButtonLabel] = useState<string>(
    authConfig?.openid.buttonLabel || '',
  );
  const [openIdButtonIcon, setOpenIdButtonIcon] = useState<string>(
    authConfig?.openid.buttonIcon || '',
  );

  const updateAuthSettings = () => {
    onUpdateAuthSettings({
      registrationEnabled: isRegEnabled,
      socialLoginEnabled,
      googleLoginEnabled: isGoogleEnabled,
      githubLoginEnabled: isGithubEnabled,
      discordLoginEnabled: isDiscordEnabled,
      openidLoginEnabled: isOpenIDEnabled,
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
      github: {
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      },
      discord: {
        clientId: discordClientId,
        clientSecret: discordClientSecret,
      },
      openid: {
        clientId: openidClientId,
        clientSecret: openidClientSecret,
        issuer: openidIssuer,
        sessionSecret: openIdSessionSecret,
        scope: openIdScope,
        buttonLabel: openIdButtonLabel,
        buttonIcon: openIdButtonIcon,
      },
    });
  };

  return (
    <Card title="Registration & Authentication">
      <div className="flex flex-col gap-3">
        <div className="align-items-center flex">
          <Checkbox
            className="pt-1"
            checked={isRegEnabled}
            id="regEnabled"
            tooltip={desc.Auth.registrationEnabled}
            tooltipOptions={{ position: 'top' }}
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
            tooltip={desc.Auth.socialLoginEnabled}
            tooltipOptions={{ position: 'top' }}
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
            tooltip={desc.Auth.googleLoginEnabled}
            tooltipOptions={{ position: 'top' }}
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
                <InputText
                  className="w-full"
                  id="googleClientId"
                  type="text"
                  value={googleClientId}
                  tooltip={desc.Auth.google.clientId}
                  tooltipOptions={{ position: 'right' }}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                />
                <label htmlFor="googleClientId">Google Client ID</label>
              </span>
            </div>
            <div className="w-1/2">
              <span className="p-float-label">
                <InputText
                  className="w-full"
                  id="googleClientSecret"
                  type="text"
                  value={googleClientSecret}
                  tooltip={desc.Auth.google.clientSecret}
                  tooltipOptions={{ position: 'left' }}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                />
                <label htmlFor="googleClientSecret">Google Client Secret</label>
              </span>
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
            tooltip={desc.Auth.githubLoginEnabled}
            tooltipOptions={{ position: 'top' }}
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
                <InputText
                  className="w-full"
                  id="githubClientId"
                  type="text"
                  value={githubClientId}
                  tooltip={desc.Auth.github.clientId}
                  tooltipOptions={{ position: 'right' }}
                  onChange={(e) => setGithubClientId(e.target.value)}
                />
                <label htmlFor="githubClientId">Github Client ID</label>
              </span>
            </div>
            <div className="w-1/2">
              <span className="p-float-label">
                <InputText
                  className="w-full"
                  id="githubClientSecret"
                  type="text"
                  value={githubClientSecret}
                  tooltip={desc.Auth.github.clientSecret}
                  tooltipOptions={{ position: 'left' }}
                  onChange={(e) => setGithubClientSecret(e.target.value)}
                />
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
            tooltip={desc.Auth.discordLoginEnabled}
            tooltipOptions={{ position: 'top' }}
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
                <InputText
                  className="w-full"
                  id="discordClientId"
                  type="text"
                  value={discordClientId}
                  tooltip={desc.Auth.discord.clientId}
                  tooltipOptions={{ position: 'right' }}
                  onChange={(e) => setDiscordClientId(e.target.value)}
                />
                <label htmlFor="discordClientId">Discord Client ID</label>
              </span>
            </div>
            <div className="w-1/2">
              <span className="p-float-label">
                <InputText
                  className="w-full"
                  id="discordClientSecret"
                  type="text"
                  value={discordClientSecret}
                  tooltip={desc.Auth.discord.clientSecret}
                  tooltipOptions={{ position: 'left' }}
                  onChange={(e) => setDiscordClientSecret(e.target.value)}
                />
                <label htmlFor="discordClientSecret">Discord Client Secret</label>
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
            tooltip={desc.Auth.openidLoginEnabled}
            tooltipOptions={{ position: 'top' }}
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
                  <InputText
                    className="w-full"
                    id="openIdClientId"
                    type="text"
                    value={openidClientId}
                    tooltip={desc.Auth.openid.clientId}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setOpenidClientId(e.target.value)}
                  />
                  <label htmlFor="openIdClientId">OpenID Client ID</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="openIdClientSecret"
                    type="text"
                    value={openidClientSecret}
                    tooltip={desc.Auth.openid.clientSecret}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setOpenidClientSecret(e.target.value)}
                  />
                  <label htmlFor="openIdClientSecret">OpenID Client Secret</label>
                </span>
              </div>
            </div>
            <div className="flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="openIdIssuer"
                    type="text"
                    value={openidIssuer}
                    tooltip={desc.Auth.openid.issuer}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setOpenidIssuer(e.target.value)}
                  />
                  <label htmlFor="openIdIssuer">OpenID Issuer</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="openIdSessionSecret"
                    type="text"
                    value={openIdSessionSecret}
                    tooltip={desc.Auth.openid.sessionSecret}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setOpenIdSessionSecret(e.target.value)}
                  />
                  <label htmlFor="openIdSessionSecret">OpenID Session Secret</label>
                </span>
              </div>
            </div>
            <div className="w-full">
              <span className="p-float-label">
                <InputText
                  className="w-full"
                  id="openIdScope"
                  type="text"
                  value={openIdScope}
                  tooltip={desc.Auth.openid.scope}
                  tooltipOptions={{ position: 'top' }}
                  onChange={(e) => setOpenIdScope(e.target.value)}
                />
                <label htmlFor="openIdScope">OpenID Scope</label>
              </span>
            </div>
            <div className="mb-5 flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="openIdButtonLabel"
                    type="text"
                    value={openIdButtonLabel}
                    tooltip={desc.Auth.openid.buttonLabel}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setOpenIdButtonLabel(e.target.value)}
                  />
                  <label htmlFor="openIdButtonLabel">OpenID Button Label</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="openIdButtonIcon"
                    type="text"
                    value={openIdButtonIcon}
                    tooltip={desc.Auth.openid.buttonIcon}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setOpenIdButtonIcon(e.target.value)}
                  />
                  <label htmlFor="openIdButtonIcon">OpenID Button Icon URL</label>
                </span>
              </div>
            </div>
          </div>
        )}
        <Button label="Save" className="mt-5 w-1/4" onClick={updateAuthSettings} />
      </div>
      <p className="text-semibold mt-5 text-sm text-gray-600">
        Note: JWT_SECRET, JWT_REFRESH_SECRET, and SESSION_EXPIRY should be set in a local .env
      </p>
    </Card>
  );
}

export default AuthSettings;
