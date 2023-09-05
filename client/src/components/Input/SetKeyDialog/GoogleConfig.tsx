import React from 'react';
import { object, string } from 'zod';
import type { TConfigProps } from '~/common';
import FileUpload from '../EndpointMenu/FileUpload';
import { useLocalize } from '~/hooks';

const CredentialsSchema = object({
  client_email: string().email().min(3),
  project_id: string().min(3),
  private_key: string().min(601),
});

const validateCredentials = (credentials: Record<string, unknown>) => {
  const result = CredentialsSchema.safeParse(credentials);
  return result.success;
};

const GoogleConfig = ({ setUserKey }: Pick<TConfigProps, 'setUserKey'>) => {
  const localize = useLocalize();
  return (
    <FileUpload
      id="googleKey"
      className="w-full"
      text={localize('com_endpoint_config_key_import_json_key')}
      successText={localize('com_endpoint_config_key_import_json_key_success')}
      invalidText={localize('com_endpoint_config_key_import_json_key_invalid')}
      validator={validateCredentials}
      onFileSelected={(data) => {
        setUserKey(JSON.stringify(data));
      }}
    />
  );
};

export default GoogleConfig;
