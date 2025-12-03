import {
  AuthorizationTypeEnum,
  AuthTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import { MCPForm } from '~/common/types';

export const defaultMCPFormValues: MCPForm = {
  type: AuthTypeEnum.None,
  saved_auth_fields: false,
  api_key: '',
  authorization_type: AuthorizationTypeEnum.Basic,
  custom_auth_header: '',
  oauth_client_id: '',
  oauth_client_secret: '',
  authorization_url: '',
  client_url: '',
  scope: '',
  token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
  name: '',
  description: '',
  url: '',
  tools: [],
  icon: '',
  trust: false,
};
