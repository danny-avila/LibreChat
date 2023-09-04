import React from 'react';
import FileUpload from '../EndpointMenu/FileUpload';
import { useLocalize } from '~/hooks';

const GoogleConfig = ({ setToken }: { setToken: React.Dispatch<React.SetStateAction<string>> }) => {
  const localize = useLocalize();
  return (
    <FileUpload
      id="googleKey"
      className="w-full"
      text={localize('com_endpoint_config_token_import_json_key')}
      successText={localize('com_endpoint_config_token_import_json_key_succesful')}
      invalidText={localize('com_endpoint_config_token_import_json_key_invalid')}
      validator={(credentials) => {
        if (!credentials) {
          return false;
        }

        if (
          !credentials.client_email ||
          typeof credentials.client_email !== 'string' ||
          credentials.client_email.length <= 2
        ) {
          return false;
        }

        if (
          !credentials.project_id ||
          typeof credentials.project_id !== 'string' ||
          credentials.project_id.length <= 2
        ) {
          return false;
        }

        if (
          !credentials.private_key ||
          typeof credentials.private_key !== 'string' ||
          credentials.private_key.length <= 600
        ) {
          return false;
        }

        return true;
      }}
      onFileSelected={(data) => {
        setToken(JSON.stringify(data));
      }}
    />
  );
};

export default GoogleConfig;
