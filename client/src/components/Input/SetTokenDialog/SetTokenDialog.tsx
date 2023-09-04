import React, { useState } from 'react';
import HelpText from './HelpText';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import { Dialog } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { alternateName } from '~/utils';
import store from '~/store';
import { useLocalize } from '~/hooks';

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const localize = useLocalize();
  const [token, setToken] = useState('');
  const { saveToken } = store.useToken(endpoint);

  const submit = () => {
    saveToken(token);
    onOpenChange(false);
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
            <small className="text-red-600">{localize('com_endpoint_config_token_server')}</small>
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
