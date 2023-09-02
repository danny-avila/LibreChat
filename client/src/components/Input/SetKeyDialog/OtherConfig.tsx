import React from 'react';
import InputWithLabel from './InputWithLabel';
import { ConfigProps } from '~/common';
import { useLocalize } from '~/hooks';

const OtherConfig = ({ key, setKey }: ConfigProps) => {
  const localize = useLocalize();
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={key ?? ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKey(e.target.value ?? '')}
      label={localize('com_endpoint_config_token_name')}
    />
  );
};

export default OtherConfig;
