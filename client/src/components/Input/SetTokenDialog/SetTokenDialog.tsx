import React, { useState }from 'react';
import HelpText from './HelpText';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import { Dialog, DialogTemplate } from '~/components';
import { alternateName } from '~/utils';
import store from '~/store';

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const [token, setToken] = useState('');
  const { saveToken } = store.useToken(endpoint);

  const submit = () => {
    saveToken(token);
    onOpenChange(false);
  };

  const endpointComponents = {
    'google': GoogleConfig,
    'openAI': OpenAIConfig,
    'azureOpenAI': OpenAIConfig,
    'gptPlugins': OpenAIConfig,
    'default': OtherConfig
  };

  const EndpointComponent = endpointComponents[endpoint] || endpointComponents['default'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`Set Token for ${alternateName[endpoint] ?? endpoint}`}
        main={
          <div className="grid w-full items-center gap-2">
            <EndpointComponent token={token} setToken={setToken} endpoint={endpoint}/>
            <small className="text-red-600">
        Your token will be sent to the server, but not saved.
            </small>
            <HelpText endpoint={endpoint}/>
          </div>
        }
        selection={{
          selectHandler: submit,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: 'Submit'
        }}
      />
    </Dialog>
  );
};

export default SetTokenDialog;
