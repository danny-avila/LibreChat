import React, { useState } from 'react';
import type { TDialogProps } from '~/common';
import { Dialog, Dropdown } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { RevokeKeysButton } from '~/components/Nav';
import { cn, alternateName } from '~/utils';
import { useUserKey, useLocalize } from '~/hooks';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import HelpText from './HelpText';

const endpointComponents = {
  google: GoogleConfig,
  openAI: OpenAIConfig,
  azureOpenAI: OpenAIConfig,
  gptPlugins: OpenAIConfig,
  default: OtherConfig,
};

const EXPIRY = {
  THIRTY_MINUTES: { display: 'in 30 minutes', value: 30 * 60 * 1000 },
  TWO_HOURS: { display: 'in 2 hours', value: 2 * 60 * 60 * 1000 },
  TWELVE_HOURS: { display: 'in 12 hours', value: 12 * 60 * 60 * 1000 },
  ONE_DAY: { display: 'in 1 day', value: 24 * 60 * 60 * 1000 },
  ONE_WEEK: { display: 'in 7 days', value: 7 * 24 * 60 * 60 * 1000 },
  ONE_MONTH: { display: 'in 30 days', value: 30 * 24 * 60 * 60 * 1000 },
};

const SetKeyDialog = ({
  open,
  onOpenChange,
  endpoint,
}: Pick<TDialogProps, 'open' | 'onOpenChange'> & {
  endpoint: string;
}) => {
  const [userKey, setUserKey] = useState('');
  const [expiresAtLabel, setExpiresAtLabel] = useState(EXPIRY.TWELVE_HOURS.display);
  const { getExpiry, saveUserKey } = useUserKey(endpoint);
  const localize = useLocalize();

  const expirationOptions = Object.values(EXPIRY);

  const handleExpirationChange = (label: string) => {
    setExpiresAtLabel(label);
  };

  const submit = () => {
    const selectedOption = expirationOptions.find((option) => option.display === expiresAtLabel);
    const expiresAt = Date.now() + (selectedOption ? selectedOption.value : 0);
    saveUserKey(userKey, expiresAt);
    onOpenChange(false);
    setUserKey('');
  };

  const EndpointComponent = endpointComponents[endpoint] ?? endpointComponents['default'];
  const expiryTime = getExpiry();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`${localize('com_endpoint_config_key_for')} ${alternateName[endpoint] ?? endpoint}`}
        className="w-full max-w-[650px] sm:w-3/4 md:w-3/4 lg:w-3/4"
        main={
          <div className="grid w-full items-center gap-2">
            <small className="text-red-600">
              {`${localize('com_endpoint_config_key_encryption')} ${
                !expiryTime
                  ? localize('com_endpoint_config_key_expiry')
                  : `${new Date(expiryTime).toLocaleString()}`
              }`}
            </small>
            <Dropdown
              label="Expires "
              value={expiresAtLabel}
              onChange={handleExpirationChange}
              options={expirationOptions.map((option) => option.display)}
              width={185}
            />
            <EndpointComponent userKey={userKey} setUserKey={setUserKey} endpoint={endpoint} />
            <HelpText endpoint={endpoint} />
          </div>
        }
        selection={{
          selectHandler: submit,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: localize('com_ui_submit'),
        }}
        leftButtons={
          <RevokeKeysButton endpoint={endpoint} showText={false} disabled={!expiryTime} />
        }
      />
    </Dialog>
  );
};

export default SetKeyDialog;
