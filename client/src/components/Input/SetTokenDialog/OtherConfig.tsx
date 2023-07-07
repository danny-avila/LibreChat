import React from 'react';
import InputWithLabel from './InputWithLabel';

type ConfigProps = {
  token: string;
  setToken: React.Dispatch<React.SetStateAction<string>>;
};

const OtherConfig = ({ token, setToken } : ConfigProps) => {
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={token || ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value || '')}
      label={'Token Name'}
    />
  );
};

export default OtherConfig;
