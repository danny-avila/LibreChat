import React from 'react';
import InputWithLabel from './InputWithLabel';
import { useLocalize } from '~/hooks';

type ConfigProps = {
  token: string;
  setToken: React.Dispatch<React.SetStateAction<string>>;
};

const OtherConfig = ({ token, setToken }: ConfigProps) => {
  const localize = useLocalize();
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={token || ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value || '')}
      label={localize('com_endpoint_config_token_name')}
    />
  );
};

export default OtherConfig;
