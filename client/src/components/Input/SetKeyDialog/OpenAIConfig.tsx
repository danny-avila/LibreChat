/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
// TODO: Temporarily remove checkbox until Plugins solution for Azure is figured out
// import * as Checkbox from '@radix-ui/react-checkbox';
// import { CheckIcon } from '@radix-ui/react-icons';
import InputWithLabel from './InputWithLabel';
import { ConfigProps } from '~/common';

function isJson(str: string) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

type OpenAIConfigProps = ConfigProps & {
  endpoint: string;
};

const OpenAIConfig = ({ key, setKey, endpoint }: OpenAIConfigProps) => {
  const [showPanel, setShowPanel] = useState(endpoint === 'azureOpenAI');

  useEffect(() => {
    if (isJson(key)) {
      setShowPanel(true);
    }
    setKey('');
  }, []);

  useEffect(() => {
    if (!showPanel && isJson(key)) {
      setKey('');
    }
  }, [showPanel]);

  function getAzure(name: string) {
    if (isJson(key)) {
      const newKey = JSON.parse(key);
      return newKey[name];
    } else {
      return '';
    }
  }

  function setAzure(name: string, value: number | string | boolean) {
    let newKey = {};
    if (isJson(key)) {
      newKey = JSON.parse(key);
    }
    newKey[name] = value;

    setKey(JSON.stringify(newKey));
  }
  return (
    <>
      {!showPanel ? (
        <>
          <InputWithLabel
            id={'chatGPTLabel'}
            value={key || ''}
            onChange={(e: { target: { value: string } }) => setKey(e.target.value || '')}
            label={'OpenAI API Key'}
          />
        </>
      ) : (
        <>
          <InputWithLabel
            id={'instanceNameLabel'}
            value={getAzure('azureOpenAIApiInstanceName') || ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiInstanceName', e.target.value || '')
            }
            label={'Azure OpenAI Instance Name'}
          />

          <InputWithLabel
            id={'deploymentNameLabel'}
            value={getAzure('azureOpenAIApiDeploymentName') || ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiDeploymentName', e.target.value || '')
            }
            label={'Azure OpenAI Deployment Name'}
          />

          <InputWithLabel
            id={'versionLabel'}
            value={getAzure('azureOpenAIApiVersion') || ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiVersion', e.target.value || '')
            }
            label={'Azure OpenAI API Version'}
          />

          <InputWithLabel
            id={'apiKeyLabel'}
            value={getAzure('azureOpenAIApiKey') || ''}
            onChange={(e: { target: { value: string } }) =>
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
