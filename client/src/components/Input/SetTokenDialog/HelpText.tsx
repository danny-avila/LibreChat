import React from 'react';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

function HelpText({ endpoint } : { endpoint: string }) {
  const lang = useRecoilValue(store.lang);
  const textMap = {
    bingAI: (
      <small className="break-all text-gray-600">
        {localize(lang, 'com_endpoint_config_token_bing1')}
        <a
          target="_blank"
          href="https://www.bing.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://www.bing.com
        </a>
        {localize(lang, 'com_endpoint_config_token_bing2')}
        <a
          target="_blank"
          href="https://github.com/waylaidwanderer/node-chatgpt-api/issues/378#issuecomment-1559868368"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        instructions
        </a>
        {localize(lang,'com_endpoint_config_token_bing3')}
      </small>
    ),
    chatGPTBrowser: (
      <small className="break-all text-gray-600">
        {localize(lang, 'com_endpoint_config_token_chatgpt1')}
        <a
          target="_blank"
          href="https://chat.openai.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://chat.openai.com
        </a>
        {localize(lang, 'com_endpoint_config_token_chatgpt2')}
        <a
          target="_blank"
          href="https://chat.openai.com/api/auth/session"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://chat.openai.com/api/auth/session
        </a>
        {localize(lang, 'com_endpoint_config_token_chatgpt3')}
      </small>
    ),
    google: (
      <small className="break-all text-gray-600">
        {localize(lang, 'com_endpoint_config_token_google1')}
        <a
          target="_blank"
          href="https://console.cloud.google.com/vertex-ai"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        Vertex AI
        </a>{' '}
        {localize(lang, 'com_endpoint_config_token_google2')}
        <a
          target="_blank"
          href="https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        Create a Service Account
        </a>
        {localize(lang, 'com_endpoint_config_token_google3')}
      </small>
    )

  };

  return textMap[endpoint] || null;
};

export default React.memo(HelpText);