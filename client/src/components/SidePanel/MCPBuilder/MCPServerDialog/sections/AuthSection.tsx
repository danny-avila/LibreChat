import { useMemo, useState } from 'react';
import { Copy, CopyCheck } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Label, Input, Checkbox, SecretInput, Radio, useToastContext } from '@librechat/client';
import { AuthTypeEnum, AuthorizationTypeEnum } from '../hooks/useMCPServerForm';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import { useLocalize, useCopyToClipboard } from '~/hooks';
import { cn } from '~/utils';

interface AuthSectionProps {
  isEditMode: boolean;
  serverName?: string;
}

export default function AuthSection({ isEditMode, serverName }: AuthSectionProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const {
    register,
    setValue,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  const [isCopying, setIsCopying] = useState(false);

  const authType = useWatch<MCPServerFormData, 'auth.auth_type'>({
    name: 'auth.auth_type',
  }) as AuthTypeEnum;

  const apiKeySource = useWatch<MCPServerFormData, 'auth.api_key_source'>({
    name: 'auth.api_key_source',
  }) as 'admin' | 'user';

  const authorizationType = useWatch<MCPServerFormData, 'auth.api_key_authorization_type'>({
    name: 'auth.api_key_authorization_type',
  }) as AuthorizationTypeEnum;

  const redirectUri = serverName
    ? `${window.location.origin}/api/mcp/${serverName}/oauth/callback`
    : '';

  const copyLink = useCopyToClipboard({ text: redirectUri });

  const authTypeOptions = useMemo(
    () => [
      { value: AuthTypeEnum.None, label: localize('com_ui_no_auth') },
      { value: AuthTypeEnum.ServiceHttp, label: localize('com_ui_api_key') },
      { value: AuthTypeEnum.OAuth, label: 'OAuth' },
    ],
    [localize],
  );

  const headerFormatOptions = useMemo(
    () => [
      { value: AuthorizationTypeEnum.Bearer, label: localize('com_ui_bearer') },
      { value: AuthorizationTypeEnum.Basic, label: localize('com_ui_basic') },
      { value: AuthorizationTypeEnum.Custom, label: localize('com_ui_custom') },
    ],
    [localize],
  );

  return (
    <div className="space-y-3">
      {/* Auth Type Radio */}
      <fieldset className="space-y-1.5">
        <legend>
          <Label id="auth-type-label" className="text-sm font-medium">
            {localize('com_ui_authentication')}
          </Label>
        </legend>
        <Radio
          options={authTypeOptions}
          value={authType || AuthTypeEnum.None}
          onChange={(val) => setValue('auth.auth_type', val as AuthTypeEnum)}
          fullWidth
          aria-labelledby="auth-type-label"
        />
      </fieldset>

      {/* API Key Fields */}
      {authType === AuthTypeEnum.ServiceHttp && (
        <div className="space-y-3 rounded-lg border border-border-light p-3">
          {/* User provides own key checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="user_provides_key"
              checked={apiKeySource === 'user'}
              onCheckedChange={(checked) =>
                setValue('auth.api_key_source', checked ? 'user' : 'admin')
              }
              aria-labelledby="user_provides_key_label"
            />
            <label
              id="user_provides_key_label"
              htmlFor="user_provides_key"
              className="cursor-pointer text-sm"
            >
              {localize('com_ui_user_provides_key')}
            </label>
          </div>

          {/* API Key input - only when admin provides */}
          {apiKeySource !== 'user' && (
            <div className="space-y-1.5">
              <Label htmlFor="api_key" className="text-sm font-medium">
                {localize('com_ui_api_key')}
              </Label>
              <SecretInput id="api_key" placeholder="sk-..." {...register('auth.api_key')} />
            </div>
          )}

          {/* Header Format Radio */}
          <fieldset className="space-y-1.5">
            <legend>
              <Label id="header-format-label" className="text-sm font-medium">
                {localize('com_ui_header_format')}
              </Label>
            </legend>
            <Radio
              options={headerFormatOptions}
              value={authorizationType || AuthorizationTypeEnum.Bearer}
              onChange={(val) =>
                setValue('auth.api_key_authorization_type', val as AuthorizationTypeEnum)
              }
              fullWidth
              aria-labelledby="header-format-label"
            />
          </fieldset>

          {/* Custom header name */}
          {authorizationType === AuthorizationTypeEnum.Custom && (
            <div className="space-y-1.5">
              <Label htmlFor="custom_header" className="text-sm font-medium">
                {localize('com_ui_custom_header_name')}
              </Label>
              <Input
                id="custom_header"
                placeholder="X-Api-Key"
                {...register('auth.api_key_custom_header')}
              />
            </div>
          )}
        </div>
      )}

      {/* OAuth Fields */}
      {authType === AuthTypeEnum.OAuth && (
        <div className="space-y-3 rounded-lg border border-border-light p-3">
          {/* Client ID & Secret in a grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="oauth_client_id" className="text-sm font-medium">
                {localize('com_ui_client_id')}{' '}
                {!isEditMode && (
                  <>
                    <span aria-hidden="true" className="text-text-secondary">
                      *
                    </span>
                    <span className="sr-only">{localize('com_ui_field_required')}</span>
                  </>
                )}
              </Label>
              <Input
                id="oauth_client_id"
                autoComplete="off"
                placeholder={isEditMode ? localize('com_ui_leave_blank_to_keep') : ''}
                aria-invalid={errors.auth?.oauth_client_id ? 'true' : 'false'}
                aria-describedby={
                  errors.auth?.oauth_client_id ? 'oauth-client-id-error' : undefined
                }
                {...register('auth.oauth_client_id', { required: !isEditMode })}
                className={cn(errors.auth?.oauth_client_id && 'border-border-destructive')}
              />
              {errors.auth?.oauth_client_id && (
                <p
                  id="oauth-client-id-error"
                  role="alert"
                  className="text-xs text-text-destructive"
                >
                  {localize('com_ui_field_required')}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauth_client_secret" className="text-sm font-medium">
                {localize('com_ui_client_secret')}{' '}
                {!isEditMode && (
                  <>
                    <span aria-hidden="true" className="text-text-secondary">
                      *
                    </span>
                    <span className="sr-only">{localize('com_ui_field_required')}</span>
                  </>
                )}
              </Label>
              <SecretInput
                id="oauth_client_secret"
                placeholder={isEditMode ? localize('com_ui_leave_blank_to_keep') : ''}
                aria-invalid={errors.auth?.oauth_client_secret ? 'true' : 'false'}
                aria-describedby={
                  errors.auth?.oauth_client_secret ? 'oauth-client-secret-error' : undefined
                }
                {...register('auth.oauth_client_secret', { required: !isEditMode })}
                className={cn(errors.auth?.oauth_client_secret && 'border-border-destructive')}
              />
              {errors.auth?.oauth_client_secret && (
                <p
                  id="oauth-client-secret-error"
                  role="alert"
                  className="text-xs text-text-destructive"
                >
                  {localize('com_ui_field_required')}
                </p>
              )}
            </div>
          </div>

          {/* Auth URL & Token URL in a grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="oauth_authorization_url" className="text-sm font-medium">
                {localize('com_ui_auth_url')}
              </Label>
              <Input
                id="oauth_authorization_url"
                placeholder="https://..."
                {...register('auth.oauth_authorization_url')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauth_token_url" className="text-sm font-medium">
                {localize('com_ui_token_url')}
              </Label>
              <Input
                id="oauth_token_url"
                placeholder="https://..."
                {...register('auth.oauth_token_url')}
              />
            </div>
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label htmlFor="oauth_scope" className="text-sm font-medium">
              {localize('com_ui_scope')}
            </Label>
            <Input id="oauth_scope" placeholder="read write" {...register('auth.oauth_scope')} />
          </div>

          {/* Redirect URI */}
          {isEditMode && redirectUri && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-redirect-uri" className="text-sm font-medium">
                {localize('com_ui_redirect_uri')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="auth-redirect-uri"
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="flex-1 text-xs text-text-secondary"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (isCopying) return;
                    showToast({ message: localize('com_ui_copied_to_clipboard') });
                    copyLink(setIsCopying);
                  }}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-light text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label={localize('com_ui_copy_link')}
                >
                  {isCopying ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
