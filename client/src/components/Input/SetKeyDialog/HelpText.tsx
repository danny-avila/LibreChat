import { memo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

function HelpText({ endpoint }: { endpoint: string }) {
  const localize = useLocalize();
  const textMap = {
    [EModelEndpoint.chatGPTBrowser]: (
      <small className="break-all text-gray-500">
        {localize('com_endpoint_config_key_chatgpt')}{' '}
        <a
          target="_blank"
          href="https://chat.openai.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          https://chat.openai.com
        </a>
        {', '}
        {localize('com_endpoint_config_key_chatgpt_then_visit')}{' '}
        <a
          target="_blank"
          href="https://chat.openai.com/api/auth/session"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
          https://chat.openai.com/api/auth/session
        </a>
        {'. '}
        {localize('com_endpoint_config_key_chatgpt_copy_token')}
      </small>
    ),
    [EModelEndpoint.google]: (
      <>
        <small className="break-all text-gray-500">
          {localize('com_endpoint_config_google_service_key')}
          {': '}
          {localize('com_endpoint_config_key_google_need_to')}{' '}
          <a
            target="_blank"
            href="https://console.cloud.google.com/vertex-ai"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {localize('com_endpoint_config_key_google_vertex_ai')}
          </a>{' '}
          {localize('com_endpoint_config_key_google_vertex_api')}{' '}
          <a
            target="_blank"
            href="https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {localize('com_endpoint_config_key_google_service_account')}
          </a>
          {'. '}
          {localize('com_endpoint_config_key_google_vertex_api_role')}
        </small>
        <small className="break-all text-gray-500">
          {localize('com_endpoint_config_google_api_key')}
          {': '}
          {localize('com_endpoint_config_google_api_info')}{' '}
          <a
            target="_blank"
            href="https://makersuite.google.com/app/apikey"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {localize('com_endpoint_config_click_here')}
          </a>{' '}
        </small>
      </>
    ),
  };

  return textMap[endpoint] || null;
}

export default memo(HelpText);
