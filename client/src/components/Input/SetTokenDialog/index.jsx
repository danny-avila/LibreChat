import React, { useEffect, useState } from 'react';
import DialogTemplate from '../../ui/DialogTemplate';
import { Dialog } from '../../ui/Dialog.tsx';
import { Input } from '../../ui/Input.tsx';
import { Label } from '../../ui/Label.tsx';
import { cn } from '~/utils/';
import FileUpload from '../NewConversationMenu/FileUpload';
import store from '~/store';

const SetTokenDialog = ({ open, onOpenChange, endpoint }) => {
  const [token, setToken] = useState('');
  const { getToken, saveToken } = store.useToken(endpoint);

  const defaultTextProps =
    'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-400 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const submit = () => {
    saveToken(token);
    onOpenChange(false);
  };

  useEffect(() => {
    setToken(getToken() ?? '');
  }, [open]);

  const helpText = {
    bingAI: (
      <small className="break-all text-gray-600">
        The Bing Access Token is the "_U" cookie from bing.com. Use dev tools or an extension while logged
        into the site to view it.
      </small>
    ),
    chatGPTBrowser: (
      <small className="break-all text-gray-600">
        To get your Access token For ChatGPT 'Free Version', login to{' '}
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
        . Make sure to click 'Create and Continue' to give at least the 'Vertex AI User' role. Lastly, create
        a JSON key to import here.
      </small>
    )
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogTemplate
        title={`Set Token of ${endpoint}`}
        main={
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="chatGptLabel"
              className="text-left text-sm font-medium"
            >
              Token Name
              <br />
            </Label>
            {endpoint === 'google' ? (
              <FileUpload
              id="googleKey"
                className="w-full"
                text="Import Service Account JSON Key"
                successText="Successfully Imported Service Account JSON Key"
                invalidText="Invalid Service Account JSON Key, Did you import the correct file?"
                validator={credentials => {
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
                onFileSelected={data => {
                  setToken(JSON.stringify(data));
                }}
              />
            ) : (
              <Input
                id="chatGptLabel"
                value={token || ''}
                onChange={e => setToken(e.target.value || '')}
                placeholder="Set the token."
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
              />
            )}
            <small className="text-red-600">Your token will be sent to the server, but not saved.</small>
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
