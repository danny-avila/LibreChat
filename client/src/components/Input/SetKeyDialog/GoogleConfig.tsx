import React from 'react';
import FileUpload from '../EndpointMenu/FileUpload';
import { ConfigProps } from '~/common';

const GoogleConfig = ({ setUserKey }: Pick<ConfigProps, 'setUserKey'>) => {
  return (
    <FileUpload
      id="googleKey"
      className="w-full"
      text="Import Service Account JSON Key"
      successText="Successfully Imported Service Account JSON Key"
      invalidText="Invalid Service Account JSON Key, Did you import the correct file?"
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
        setUserKey(JSON.stringify(data));
      }}
    />
  );
};

export default GoogleConfig;
