import React, { useState } from 'react';
import HelpText from './HelpText';
import GoogleConfig from './GoogleConfig';
import OpenAIConfig from './OpenAIConfig';
import OtherConfig from './OtherConfig';
import { Dialog, DialogTemplate } from '~/components';
import { alternateName } from '~/utils';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const lang = useRecoilValue(store.lang);
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
        title={localize(lang, 'com_endpoint_token_set', alternateName[endpoint] ?? endpoint)}
        main={
          <div className="grid w-full items-center gap-2">
            <EndpointComponent token={token} setToken={setToken} endpoint={endpoint}/>
            <small className="text-red-600">
              {localize(lang, 'com_endpoint_config_token_sent_server')}
            </small>
            <HelpText endpoint={endpoint}/>
          </div>
        }
        selection={{
          selectHandler: submit,
          selectClasses: 'bg-green-600 hover:bg-green-700 dark:hover:bg-green-800 text-white',
          selectText: localize(lang, 'com_endpoint_token_submit')
        }}
      />
    </Dialog>
  );
};

export default SetTokenDialog;
