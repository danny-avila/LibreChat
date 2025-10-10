import type { TTokenStoreConfig } from 'librechat-data-provider';
import { MCPTokenStorage } from './tokens';
import {
  createParameterStoreTokenMethods,
  createSecretsManagerTokenMethods,
  type MCPTokenMethods,
} from './storage';

export interface TokenStoreFactoryParams {
  config?: TTokenStoreConfig | null;
  defaultMethods: MCPTokenMethods;
}

export function configureTokenStore({
  config,
  defaultMethods,
}: TokenStoreFactoryParams): MCPTokenMethods {
  const backend = config?.backend ?? 'mongo';
  const encryptBeforeStore = config?.encryptBeforeStore ?? true;
  MCPTokenStorage.setEncryptionPreference(encryptBeforeStore);

  switch (backend) {
    case 'aws-parameter':
      return createParameterStoreTokenMethods({
        awsConfig: config?.aws,
        retry: config?.aws?.retry,
      });
    case 'aws-secrets':
      return createSecretsManagerTokenMethods({
        awsConfig: config?.aws,
        retry: config?.aws?.retry,
      });
    case 'mongo':
    default:
      return defaultMethods;
  }
}
