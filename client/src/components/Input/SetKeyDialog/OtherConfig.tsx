import React from 'react';
import InputWithLabel from './InputWithLabel';
import { ConfigProps } from '~/common';
import { useLocalize } from '~/hooks';

const OtherConfig = ({ userKey, setUserKey }: ConfigProps) => {
  const localize = useLocalize();
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={userKey ?? ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value ?? '')}
      label={localize('com_endpoint_config_token_name')}
    />
  );
};

export default OtherConfig;
