import { useState } from 'react';
import type { TEmailConfig } from 'librechat-data-provider';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { SettingsDescriptions as desc } from './SettingsDescriptions';

type TEmailSettingsProps = {
  emailConfig: TEmailConfig | undefined;
  onUpdateEmailSettings: (settings: TEmailConfig) => void;
};

function EmailSettings({ emailConfig, onUpdateEmailSettings }: TEmailSettingsProps) {
  const [emailEnabled, setIsEmailEnabled] = useState<boolean>(emailConfig?.emailEnabled || false);
  const [emailService, setEmailService] = useState<string>(
    emailConfig?.emailService || 'gmail.com',
  );
  const [emailPort, setEmailPort] = useState<string>(emailConfig?.emailPort || '587');
  const [emailUsername, setEmailUsername] = useState<string>(emailConfig?.emailUsername || '');
  const [emailPassword, setEmailPassword] = useState<string>(emailConfig?.emailPassword || '');
  const [emailFromAddress, setEmailFromAddress] = useState<string>(
    emailConfig?.emailFromAddress || '',
  );
  const [emailFromName, setemailFromName] = useState<string>(emailConfig?.emailFromName || '');

  const updateEmailSettings = () => {
    onUpdateEmailSettings({
      emailEnabled,
      emailService,
      emailPort,
      emailUsername,
      emailPassword,
      emailFromAddress,
      emailFromName,
    });
  };

  return (
    <Card title="Email">
      <div className="flex flex-col gap-3">
        <div className="align-items-center flex">
          <Checkbox
            className="mb-5 pt-1"
            id="emailEnabled"
            checked={emailEnabled}
            tooltip={desc.Email.emailEnabled}
            tooltipOptions={{ position: 'top' }}
            onChange={(e) => setIsEmailEnabled(e.checked || false)}
          />
          <label className="ml-2" htmlFor="emailEnabled">
            Enable Email
          </label>
        </div>
        {emailEnabled && (
          <div className="mb-5 flex flex-col gap-7">
            <div className="flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailService"
                    value={emailService}
                    tooltip={desc.Email.emailService}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setEmailService(e.target.value)}
                  />
                  <label htmlFor="emailService">Email Service</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailPort"
                    value={emailPort}
                    tooltip={desc.Email.emailPort}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setEmailPort(e.target.value)}
                  />
                  <label htmlFor="emailPort">Email Port</label>
                </span>
              </div>
            </div>
            <div className="flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailUsername"
                    value={emailUsername}
                    tooltip={desc.Email.emailUsername}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setEmailUsername(e.target.value)}
                  />
                  <label htmlFor="emailUsername">Email Username</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailPassword"
                    value={emailPassword}
                    tooltip={desc.Email.emailPassword}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setEmailPassword(e.target.value)}
                  />
                  <label htmlFor="emailPassword">Email Password</label>
                </span>
              </div>
            </div>
            <div className="flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailFromAddress"
                    value={emailFromAddress}
                    tooltip={desc.Email.emailFromAddress}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setEmailFromAddress(e.target.value)}
                  />
                  <label htmlFor="emailFromAddress">Email From Address</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="emailFromName"
                    value={emailFromName}
                    tooltip={desc.Email.emailFromName}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setemailFromName(e.target.value)}
                  />
                  <label htmlFor="emailFromName">Email From Name</label>
                </span>
              </div>
            </div>
          </div>
        )}
        <Button label="Save" className="mt-5 w-1/4" onClick={updateEmailSettings} />
      </div>
    </Card>
  );
}

export default EmailSettings;
