import { useEffect, useState } from 'react';
import DialogTemplate from '../../ui/DialogTemplate';
import { Dialog } from '../../ui/Dialog.tsx';
import * as Checkbox from '@radix-ui/react-checkbox';
import { CheckIcon } from '@radix-ui/react-icons';
import FileUpload from '../NewConversationMenu/FileUpload';
import store from '~/store';
import InputWithLabel from './InputWithLabel';

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const [token, setToken] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const { getToken, saveToken } = store.useToken(endpoint);

  const submit = () => {
    saveToken(token);
    onOpenChange(false);
  };

  useEffect(() => {
    let oldToken = getToken();
    if (isJson(token)) {
      setShowPanel(true);
    }
    setToken(oldToken ?? '');
  }, [open]);

  useEffect(() => {
    if (!showPanel && isJson(token)) {
      setToken('');
    }
  }, [showPanel]);

  const helpText = {
    bingAI: (
      <small className="break-all text-gray-600">
        {`To get your Access token for Bing, login to `}
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
        {` to provide the full cookie strings.`}
      </small>
    ),
    chatGPTBrowser: (
      <small className="break-all text-gray-600">
        {`To get your Access token For ChatGPT 'Free Version', login to `}
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
    )
  };

  function getAzure(name) {
    if (isJson(token)) {
      let newToken = JSON.parse(token);
      return newToken[name];
    } else {
      return '';
    }
  }

  function setAzure(name, value) {
    let newToken = {};
    if (isJson(token)) {
      newToken = JSON.parse(token);
    }
    newToken[name] = value;

    setToken(JSON.stringify(newToken));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title={`Set Token of ${endpoint}`}
        main={
          <div className="grid w-full items-center gap-2">
            {endpoint === 'google' ? (
              <FileUpload
                id="googleKey"
                className="w-full"
                text="Import Service Account JSON Key"
                successText="Successfully Imported Service Account JSON Key"
                invalidText="Invalid Service Account JSON Key, Did you import the correct file?"
                validator={(credentials) => {
                  if (!credentials) {
                    return false;
                  }

                  if (
                    !credentials.client_email ||
                    typeof credentials.client_email !== 'string' ||
                    credentials.client_email.length <= 2
                  ) {
                    return false;
                  }

                  if (
                    !credentials.project_id ||
                    typeof credentials.project_id !== 'string' ||
                    credentials.project_id.length <= 2
                  ) {
                    return false;
                  }

                  if (
                    !credentials.private_key ||
                    typeof credentials.private_key !== 'string' ||
                    credentials.private_key.length <= 600
                  ) {
                    return false;
                  }

                  return true;
                }}
                onFileSelected={(data) => {
                  setToken(JSON.stringify(data));
                }}
              />
            ) : endpoint === 'openAI' ? (
              <>
                {!showPanel ? (
                  <>
                    <InputWithLabel
                      id={'chatGPTLabel'}
                      value={token || ''}
                      onChange={(e) => setToken(e.target.value || '')}
                      label={'OpenAI API Key'}
                    />
                  </>
                ) : (
                  <>
                    <InputWithLabel
                      id={'instanceNameLabel'}
                      value={getAzure('instanceName') || ''}
                      onChange={(e) => setAzure('instanceName', e.target.value || '')}
                      label={'Azure OpenAI Instance Name'}
                    />

                    <InputWithLabel
                      id={'deploymentNameLabel'}
                      value={getAzure('deploymentName') || ''}
                      onChange={(e) => setAzure('deploymentName', e.target.value || '')}
                      label={'Azure OpenAI Deployment Name'}
                    />

                    <InputWithLabel
                      id={'versionLabel'}
                      value={getAzure('version') || ''}
                      onChange={(e) => setAzure('version', e.target.value || '')}
                      label={'Azure OpenAI API Version'}
                    />

                    <InputWithLabel
                      id={'apiKeyLabel'}
                      value={getAzure('apiKey') || ''}
                      onChange={(e) => setAzure('apiKey', e.target.value || '')}
                      label={'Azure OpenAI API Key'}
                    />
                  </>
                )}
                <div className="flex items-center">
                  <Checkbox.Root
                    className="flex h-[20px] w-[20px] appearance-none items-center justify-center rounded-[4px] bg-gray-100 text-white outline-none hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-900"
                    id="azureOpenAI"
                    checked={showPanel}
                    onCheckedChange={() => setShowPanel(!showPanel)}
                  >
                    <Checkbox.Indicator className="flex h-[20px] w-[20px] items-center justify-center rounded-[3.5px] bg-green-600">
                      <CheckIcon />
                    </Checkbox.Indicator>
                  </Checkbox.Root>

                  <label
                    className="pl-[8px] text-[15px] leading-none dark:text-white"
                    htmlFor="azureOpenAI"
                  >
                    Use Azure OpenAI.
                  </label>
                </div>
              </>
            ) : (
              <>
                <InputWithLabel
                  id={'chatGPTLabel'}
                  value={token || ''}
                  onChange={(e) => setToken(e.target.value || '')}
                  label={'Token Name'}
                />
              </>
            )}
            <small className="text-red-600">
              Your token will be sent to the server, but not saved.
            </small>
            {helpText?.[endpoint]}
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
