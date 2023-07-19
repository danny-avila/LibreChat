/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
// TODO: Temporarily remove checkbox until Plugins solution for Azure is figured out
// import * as Checkbox from '@radix-ui/react-checkbox';
// import { CheckIcon } from '@radix-ui/react-icons';
import InputWithLabel from './InputWithLabel';
import store from '~/store';

function isJson(str: string) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

type OpenAIConfigProps = {
  token: string;
  setToken: React.Dispatch<React.SetStateAction<string>>;
  endpoint: string;
};

const OpenAIConfig = ({ token, setToken, endpoint }: OpenAIConfigProps) => {
  const [showPanel, setShowPanel] = useState(endpoint === 'azureOpenAI');
  const { getToken } = store.useToken(endpoint);

  useEffect(() => {
    let oldToken = getToken();
    if (isJson(token)) {
      setShowPanel(true);
    }
    setToken(oldToken ?? '');
  }, []);

  useEffect(() => {
    if (!showPanel && isJson(token)) {
      setToken('');
    }
  }, [showPanel]);

  function getAzure(name: string) {
    if (isJson(token)) {
      let newToken = JSON.parse(token);
      return newToken[name];
    } else {
      return '';
    }
  }

  function setAzure(name: string, value: any) {
    let newToken = {};
    if (isJson(token)) {
      newToken = JSON.parse(token);
    }
    newToken[name] = value;

    setToken(JSON.stringify(newToken));
  }
  return (
    <>
      {!showPanel ? (
        <>
          <InputWithLabel
            id={'chatGPTLabel'}
            value={token || ''}
            onChange={(e: { target: { value: any } }) => setToken(e.target.value || '')}
            label={'OpenAI API Key'}
          />
        </>
      ) : (
        <>
          <InputWithLabel
            id={'instanceNameLabel'}
            value={getAzure('azureOpenAIApiInstanceName') || ''}
            onChange={(e: { target: { value: any } }) =>
              setAzure('azureOpenAIApiInstanceName', e.target.value || '')
            }
            label={'Azure OpenAI Instance Name'}
          />

          <InputWithLabel
            id={'deploymentNameLabel'}
            value={getAzure('azureOpenAIApiDeploymentName') || ''}
            onChange={(e: { target: { value: any } }) =>
              setAzure('azureOpenAIApiDeploymentName', e.target.value || '')
            }
            label={'Azure OpenAI Deployment Name'}
          />

          <InputWithLabel
            id={'versionLabel'}
            value={getAzure('azureOpenAIApiVersion') || ''}
            onChange={(e: { target: { value: any } }) =>
              setAzure('azureOpenAIApiVersion', e.target.value || '')
            }
            label={'Azure OpenAI API Version'}
          />

          <InputWithLabel
            id={'apiKeyLabel'}
            value={getAzure('azureOpenAIApiKey') || ''}
            onChange={(e: { target: { value: any } }) =>
              setAzure('azureOpenAIApiKey', e.target.value || '')
            }
            label={'Azure OpenAI API Key'}
          />
        </>
      )}
      {/* { endpoint === 'gptPlugins' && (
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
      )} */}
    </>
  );
};

export default OpenAIConfig;
