import React from 'react';
import { useLocalize } from '~/hooks';

function HelpText({ endpoint }: { endpoint: string }) {
  const localize = useLocalize();
  const textMap = {
    bingAI: (
      <small className="break-all text-gray-600">
        {localize('com_endpoint_config_token_get_edge_key')}{' '}
        <a
          target="_blank"
          href="https://www.bing.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          https://www.bing.com
        </a>
        {'. '}
        {localize('com_endpoint_config_token_get_edge_key_dev_tool')}{' '}
        <a
          target="_blank"
          href="https://github.com/waylaidwanderer/node-chatgpt-api/issues/378#issuecomment-1559868368"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          {localize('com_endpoint_config_token_edge_instructions')}
        </a>{' '}
        {localize('com_endpoint_config_token_edge_full_token_string')}
      </small>
    ),
    chatGPTBrowser: (
      <small className="break-all text-gray-600">
        {localize('com_endpoint_config_token_chatgpt')}{' '}
        <a
          target="_blank"
          href="https://chat.openai.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          https://chat.openai.com
        </a>
        {', '}
        {localize('com_endpoint_config_token_chatgpt_then_visit')}{' '}
        <a
          target="_blank"
          href="https://chat.openai.com/api/auth/session"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          https://chat.openai.com/api/auth/session
        </a>
        {'. '}
        {localize('com_endpoint_config_token_chatgpt_copy_token')}
      </small>
    ),
    google: (
      <small className="break-all text-gray-600">
        {localize('com_endpoint_config_token_google_need_to')}{' '}
        <a
          target="_blank"
          href="https://console.cloud.google.com/vertex-ai"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          {localize('com_endpoint_config_token_google_vertex_ai')}
        </a>{' '}
        {localize('com_endpoint_config_token_google_vertex_api')}{' '}
        <a
          target="_blank"
          href="https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          {localize('com_endpoint_config_token_google_service_account')}
        </a>
        {'. '}
        {localize('com_endpoint_config_token_google_vertex_api_role')}
      </small>
    ),
  };

  return textMap[endpoint] || null;
}

export default React.memo(HelpText);
