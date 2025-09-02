import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import ActionsAuth from '~/components/SidePanel/Builder/ActionsAuth';
import {
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
  AuthTypeEnum,
} from 'librechat-data-provider';

export default function MCPAuth() {
  // Create a separate form for auth
  const authMethods = useForm({
    defaultValues: {
      /* General */
      type: AuthTypeEnum.None,
      saved_auth_fields: false,
      /* API key */
      api_key: '',
      authorization_type: AuthorizationTypeEnum.Basic,
      custom_auth_header: '',
      /* OAuth */
      oauth_client_id: '',
      oauth_client_secret: '',
      authorization_url: '',
      client_url: '',
      scope: '',
      token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
    },
  });

  const { watch, setValue } = authMethods;
  const type = watch('type');

  // Sync form state when auth type changes
  useEffect(() => {
    if (type === 'none') {
      // Reset auth fields when type is none
      setValue('api_key', '');
      setValue('authorization_type', AuthorizationTypeEnum.Basic);
      setValue('custom_auth_header', '');
      setValue('oauth_client_id', '');
      setValue('oauth_client_secret', '');
      setValue('authorization_url', '');
      setValue('client_url', '');
      setValue('scope', '');
      setValue('token_exchange_method', TokenExchangeMethodEnum.DefaultPost);
    }
  }, [type, setValue]);

  return (
    <FormProvider {...authMethods}>
      <ActionsAuth />
    </FormProvider>
  );
}
