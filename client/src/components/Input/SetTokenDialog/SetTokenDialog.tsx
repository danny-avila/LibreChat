import React, { useState } from 'react';
import HelpText from './HelpText';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import { Dialog, Dropdown } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { cn, defaultTextProps, removeFocusOutlines, alternateName } from '~/utils/';
import store from '~/store';
import { useLocalize } from '~/hooks';

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const localize = useLocalize();
  const [token, setToken] = useState('');
  const [expiresAtLabel, setExpiresAtLabel] = useState('In 12 hours');
  const { saveToken } = store.useToken(endpoint);

  const expirationOptions = [
    { display: 'in 1 minute', value: 60 * 1000 },
    { display: 'in 2 hours', value: 2 * 60 * 60 * 1000 },
    { display: 'in 12 hours', value: 12 * 60 * 60 * 1000 },
    { display: 'in 1 day', value: 24 * 60 * 60 * 1000 },
    { display: 'in 7 days', value: 7 * 24 * 60 * 60 * 1000 },
    { display: 'in 30 days', value: 30 * 24 * 60 * 60 * 1000 },
  ];

  const handleExpirationChange = (label: string) => {
    setExpiresAtLabel(label);
  };

  const submit = () => {
    const selectedOption = expirationOptions.find((option) => option.display === expiresAtLabel);
    const expiresAt = Date.now() + (selectedOption ? selectedOption.value : 0);
    saveToken(token, new Date(expiresAt));
    onOpenChange(false);
    setToken('');
  };

  const endpointComponents = {
    google: GoogleConfig,
    openAI: OpenAIConfig,
    azureOpenAI: OpenAIConfig,
    gptPlugins: OpenAIConfig,
    default: OtherConfig,
  };

  const EndpointComponent = endpointComponents[endpoint] || endpointComponents['default'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`${localize('com_endpoint_config_token_for')} ${
          alternateName[endpoint] ?? endpoint
        }`}
        className="w-full max-w-[650px] sm:w-3/4 md:w-3/4 lg:w-3/4"
        main={
          <div className="grid w-full items-center gap-2">
            <EndpointComponent token={token} setToken={setToken} endpoint={endpoint} />
            <Dropdown
              label="Expires "
              value={expiresAtLabel}
              onChange={handleExpirationChange}
              options={expirationOptions.map((option) => option.display)}
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none ',
                removeFocusOutlines,
              )}
              containerClassName="flex w-full resize-none z-[51]"
            />
            <small className="text-red-600">
              Your token will be encrypted and deleted after the expiry time.
            </small>
            <HelpText endpoint={endpoint} />
          </div>
        }
        selection={{
          selectHandler: submit,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: localize('com_ui_submit'),
        }}
      />
    </Dialog>
  );
};

export default SetTokenDialog;
