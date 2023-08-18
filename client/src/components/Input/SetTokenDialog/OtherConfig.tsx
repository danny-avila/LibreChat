import React from 'react';
import InputWithLabel from './InputWithLabel';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

type ConfigProps = {
  token: string;
  setToken: React.Dispatch<React.SetStateAction<string>>;
};

const OtherConfig = ({ token, setToken } : ConfigProps) => {
  const lang = useRecoilValue(store.lang);
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={token || ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value || '')}
      label={localize(lang, 'com_endpoint_token_name')}
    />
  );
};

export default OtherConfig;
