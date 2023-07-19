import React from 'react';

function HelpText({ endpoint } : { endpoint: string }) {
  const textMap = {
    bingAI: (
      <small className="break-all text-gray-600">
        {'To get your Access token for Bing, login to '}
        <a
          target="_blank"
          href="https://www.bing.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://www.bing.com
        </a>
        {`. Use dev tools or an extension while logged into the site to copy the content of the _U cookie.
      If this fails, follow these `}
        <a
          target="_blank"
          href="https://github.com/waylaidwanderer/node-chatgpt-api/issues/378#issuecomment-1559868368"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        instructions
        </a>
        {' to provide the full cookie strings.'}
      </small>
    ),
    chatGPTBrowser: (
      <small className="break-all text-gray-600">
        {'To get your Access token For ChatGPT \'Free Version\', login to '}
        <a
          target="_blank"
          href="https://chat.openai.com"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://chat.openai.com
        </a>
      , then visit{' '}
        <a
          target="_blank"
          href="https://chat.openai.com/api/auth/session"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        https://chat.openai.com/api/auth/session
        </a>
      . Copy access token.
      </small>
    ),
    google: (
      <small className="break-all text-gray-600">
      You need to{' '}
        <a
          target="_blank"
          href="https://console.cloud.google.com/vertex-ai"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        Enable Vertex AI
        </a>{' '}
      API on Google Cloud, then{' '}
        <a
          target="_blank"
          href="https://console.cloud.google.com/projectselector/iam-admin/serviceaccounts/create?walkthrough_id=iam--create-service-account#step_index=1"
          rel="noreferrer"
          className="text-blue-600 underline"
        >
        Create a Service Account
        </a>
        {`. Make sure to click 'Create and Continue' to give at least the 'Vertex AI User' role.
      Lastly, create a JSON key to import here.`}
      </small>
    ),

  };

  return textMap[endpoint] || null;
};

export default React.memo(HelpText);