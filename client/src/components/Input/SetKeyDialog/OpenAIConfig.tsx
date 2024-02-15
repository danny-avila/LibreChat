import { useEffect, useState } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useMultipleKeys } from '~/hooks/Input';
import InputWithLabel from './InputWithLabel';
import type { TConfigProps } from '~/common';
import { isJson } from '~/utils/json';

const OpenAIConfig = ({ userKey, setUserKey, endpoint }: TConfigProps) => {
  const [showPanel, setShowPanel] = useState(endpoint === EModelEndpoint.azureOpenAI);
  const { getMultiKey: getAzure, setMultiKey: setAzure } = useMultipleKeys(setUserKey);

  useEffect(() => {
    if (isJson(userKey)) {
      setShowPanel(true);
    }
    setUserKey('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showPanel && isJson(userKey)) {
      setUserKey('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPanel]);

  return (
    <>
      {!showPanel ? (
        <>
          <InputWithLabel
            id={endpoint}
            value={userKey ?? ''}
            onChange={(e: { target: { value: string } }) => setUserKey(e.target.value ?? '')}
            label={'OpenAI API Key'}
          />
        </>
      ) : (
        <>
          <InputWithLabel
            id={'instanceNameLabel'}
            value={getAzure('azureOpenAIApiInstanceName', userKey) ?? ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiInstanceName', e.target.value ?? '', userKey)
            }
            label={'Azure OpenAI Instance Name'}
          />

          <InputWithLabel
            id={'deploymentNameLabel'}
            value={getAzure('azureOpenAIApiDeploymentName', userKey) ?? ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiDeploymentName', e.target.value ?? '', userKey)
            }
            label={'Azure OpenAI Deployment Name'}
          />

          <InputWithLabel
            id={'versionLabel'}
            value={getAzure('azureOpenAIApiVersion', userKey) ?? ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiVersion', e.target.value ?? '', userKey)
            }
            label={'Azure OpenAI API Version'}
          />

          <InputWithLabel
            id={'apiKeyLabel'}
            value={getAzure('azureOpenAIApiKey', userKey) ?? ''}
            onChange={(e: { target: { value: string } }) =>
              setAzure('azureOpenAIApiKey', e.target.value ?? '', userKey)
            }
            label={'Azure OpenAI API Key'}
          />
        </>
      )}
    </>
  );
};

export default OpenAIConfig;
