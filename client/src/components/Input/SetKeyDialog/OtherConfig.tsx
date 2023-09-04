import React from 'react';
import InputWithLabel from './InputWithLabel';
import type { TConfigProps } from '~/common';
import { useLocalize } from '~/hooks';

const OtherConfig = ({ userKey, setUserKey }: TConfigProps) => {
  const localize = useLocalize();
  return (
    <InputWithLabel
      id={'chatGPTLabel'}
      value={userKey ?? ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserKey(e.target.value ?? '')}
      label={localize('com_endpoint_config_key_name')}
    />
  );
};

export default OtherConfig;
