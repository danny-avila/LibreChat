import { useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Copy, CopyCheck } from 'lucide-react';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogTemplate,
  Button,
  useToastContext,
} from '@librechat/client';
import { TranslationKeys, useLocalize, useCopyToClipboard } from '~/hooks';
import { cn } from '~/utils';

enum AuthTypeEnum {
  None = 'none',
  ServiceHttp = 'service_http',
  OAuth = 'oauth',
}

enum AuthorizationTypeEnum {
  Basic = 'basic',
  Bearer = 'bearer',
  Custom = 'custom',
}

// Auth configuration type
export interface AuthConfig {
  auth_type?: AuthTypeEnum;
  api_key?: string;
  api_key_source?: 'admin' | 'user'; // Whether admin provides key for all or each user provides their own
  api_key_authorization_type?: AuthorizationTypeEnum;
  api_key_custom_header?: string;
  oauth_client_id?: string;
  oauth_client_secret?: string;
  oauth_authorization_url?: string;
  oauth_token_url?: string;
  oauth_scope?: string;
  server_id?: string; // For edit mode redirect URI
}

// Export enums for parent components
export { AuthTypeEnum, AuthorizationTypeEnum };

/**
 * Returns the appropriate localization key for authentication type
 */
function getAuthLocalizationKey(type: AuthTypeEnum): TranslationKeys {
  switch (type) {
    case AuthTypeEnum.ServiceHttp:
      return 'com_ui_api_key';
    case AuthTypeEnum.OAuth:
      return 'com_ui_manual_oauth';
    default:
      return 'com_ui_auto_detect';
  }
}

/**
 * OAuth and API Key authentication dialog for MCP Server Builder
 * Self-contained controlled component with its own form state
 * Only updates parent on Save, discards changes on Cancel
 */
export default function MCPAuth({
  value,
  onChange,
}: {
  value: AuthConfig;
  onChange: (config: AuthConfig) => void;
}) {
  const localize = useLocalize();
  const [openAuthDialog, setOpenAuthDialog] = useState(false);

  // Create local form with current value as default
  const methods = useForm<AuthConfig>({
    defaultValues: value,
  });

  const { handleSubmit, watch, reset } = methods;
  const authType = watch('auth_type') || AuthTypeEnum.None;

  const inputClasses = cn(
    'mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm',
    'border-border-medium bg-surface-primary outline-none',
    'focus:ring-2 focus:ring-ring',
  );

  // Reset form when dialog opens with latest value from parent
  const handleDialogOpen = (open: boolean) => {
    if (open) {
      reset(value);
    }
    setOpenAuthDialog(open);
  };

  // Save: update parent and close
  const handleSave = handleSubmit((formData) => {
    onChange(formData);
    setOpenAuthDialog(false);
  });

  return (
    <OGDialog open={openAuthDialog} onOpenChange={handleDialogOpen}>
      <OGDialogTrigger asChild>
        <div className="relative mb-4">
          <div className="mb-1.5 flex items-center">
            <label className="text-token-text-primary block font-medium">
              {localize('com_ui_authentication')}
            </label>
          </div>
          <div className="border-token-border-medium flex rounded-lg border text-sm hover:cursor-pointer">
            <div className="h-9 grow px-3 py-2">{localize(getAuthLocalizationKey(authType))}</div>
            <div className="bg-token-border-medium w-px"></div>
            <button type="button" color="neutral" className="flex items-center gap-2 px-3">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="icon-sm"
              >
                <path
                  d="M11.6439 3C10.9352 3 10.2794 3.37508 9.92002 3.98596L9.49644 4.70605C8.96184 5.61487 7.98938 6.17632 6.93501 6.18489L6.09967 6.19168C5.39096 6.19744 4.73823 6.57783 4.38386 7.19161L4.02776 7.80841C3.67339 8.42219 3.67032 9.17767 4.01969 9.7943L4.43151 10.5212C4.95127 11.4386 4.95127 12.5615 4.43151 13.4788L4.01969 14.2057C3.67032 14.8224 3.67339 15.5778 4.02776 16.1916L4.38386 16.8084C4.73823 17.4222 5.39096 17.8026 6.09966 17.8083L6.93502 17.8151C7.98939 17.8237 8.96185 18.3851 9.49645 19.294L9.92002 20.014C10.2794 20.6249 10.9352 21 11.6439 21H12.3561C13.0648 21 13.7206 20.6249 14.08 20.014L14.5035 19.294C15.0381 18.3851 16.0106 17.8237 17.065 17.8151L17.9004 17.8083C18.6091 17.8026 19.2618 17.4222 19.6162 16.8084L19.9723 16.1916C20.3267 15.5778 20.3298 14.8224 19.9804 14.2057L19.5686 13.4788C19.0488 12.5615 19.0488 11.4386 19.5686 10.5212L19.9804 9.7943C20.3298 9.17767 20.3267 8.42219 19.9723 7.80841L19.6162 7.19161C19.2618 6.57783 18.6091 6.19744 17.9004 6.19168L17.065 6.18489C16.0106 6.17632 15.0382 5.61487 14.5036 4.70605L14.08 3.98596C13.7206 3.37508 13.0648 3 12.3561 3H11.6439Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>
        </div>
      </OGDialogTrigger>
      <FormProvider {...methods}>
        <OGDialogTemplate
          title={localize('com_ui_authentication')}
          showCloseButton={false}
          className="w-full max-w-md"
          main={
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {localize('com_ui_authentication_type')}
                </label>
                <RadioGroup.Root
                  defaultValue={AuthTypeEnum.None}
                  onValueChange={(value) =>
                    methods.setValue('auth_type', value as AuthConfig['auth_type'])
                  }
                  value={authType}
                  role="radiogroup"
                  aria-required="false"
                  dir="ltr"
                  className="flex gap-4"
                  style={{ outline: 'none' }}
                >
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="auth-auto-detect"
                      className="flex cursor-pointer items-center gap-1"
                    >
                      <RadioGroup.Item
                        type="button"
                        role="radio"
                        value={AuthTypeEnum.None}
                        id="auth-auto-detect"
                        className={cn(
                          'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                          'border-border-heavy bg-surface-primary',
                        )}
                      >
                        <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                      </RadioGroup.Item>
                      {localize('com_ui_auto_detect')}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="auth-apikey" className="flex cursor-pointer items-center gap-1">
                      <RadioGroup.Item
                        type="button"
                        role="radio"
                        value={AuthTypeEnum.ServiceHttp}
                        id="auth-apikey"
                        className={cn(
                          'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                          'border-border-heavy bg-surface-primary',
                        )}
                      >
                        <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                      </RadioGroup.Item>
                      {localize('com_ui_api_key')}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="auth-manual-oauth"
                      className="flex cursor-pointer items-center gap-1"
                    >
                      <RadioGroup.Item
                        type="button"
                        role="radio"
                        value={AuthTypeEnum.OAuth}
                        id="auth-manual-oauth"
                        className={cn(
                          'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                          'border-border-heavy bg-surface-primary',
                        )}
                      >
                        <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                      </RadioGroup.Item>
                      {localize('com_ui_manual_oauth')}
                    </label>
                  </div>
                </RadioGroup.Root>
              </div>
              {authType === AuthTypeEnum.None && (
                <div className="rounded-lg border border-border-medium bg-surface-secondary p-3">
                  <p className="text-sm text-text-secondary">
                    {localize('com_ui_auto_detect_description')}
                  </p>
                </div>
              )}
              {authType === AuthTypeEnum.ServiceHttp && <ApiKey inputClasses={inputClasses} />}
              {authType === AuthTypeEnum.OAuth && <OAuth inputClasses={inputClasses} />}
            </div>
          }
          buttons={
            <Button type="button" variant="submit" onClick={handleSave} className="text-white">
              {localize('com_ui_save')}
            </Button>
          }
        />
      </FormProvider>
    </OGDialog>
  );
}

const ApiKey = ({ inputClasses }: { inputClasses: string }) => {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const api_key_source = watch('api_key_source') || 'admin';
  const authorization_type = watch('api_key_authorization_type') || AuthorizationTypeEnum.Bearer;

  return (
    <>
      {/* API Key Source selection */}
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_api_key_source')}</label>
      <RadioGroup.Root
        defaultValue="admin"
        onValueChange={(value) => setValue('api_key_source', value)}
        value={api_key_source}
        role="radiogroup"
        aria-required="true"
        dir="ltr"
        className="mb-3 flex flex-col gap-2"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor="source-admin" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value="admin"
              id="source-admin"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_admin_provides_key')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="source-user" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value="user"
              id="source-user"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_user_provides_key')}
          </label>
        </div>
      </RadioGroup.Root>

      {/* API Key input - only show for admin-provided mode */}
      {api_key_source === 'admin' && (
        <>
          <label className="mb-1 block text-sm font-medium">{localize('com_ui_api_key')}</label>
          <input
            placeholder="<HIDDEN>"
            type="password"
            autoComplete="new-password"
            className={inputClasses}
            {...register('api_key')}
          />
        </>
      )}

      {/* User-provided mode info */}
      {api_key_source === 'user' && (
        <div className="mb-3 rounded-lg border border-border-medium bg-surface-secondary p-3">
          <p className="text-sm text-text-secondary">{localize('com_ui_user_provides_key_note')}</p>
        </div>
      )}

      {/* Header Format selection - shown for both modes */}
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_header_format')}</label>
      <RadioGroup.Root
        defaultValue={AuthorizationTypeEnum.Bearer}
        onValueChange={(value) => setValue('api_key_authorization_type', value)}
        value={authorization_type}
        role="radiogroup"
        aria-required="true"
        dir="ltr"
        className="mb-2 flex gap-6 overflow-hidden rounded-lg"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor="auth-bearer" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Bearer}
              id="auth-bearer"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_bearer')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="auth-basic" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Basic}
              id="auth-basic"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_basic')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="auth-custom" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Custom}
              id="auth-custom"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_custom')}
          </label>
        </div>
      </RadioGroup.Root>
      {authorization_type === AuthorizationTypeEnum.Custom && (
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium">
            {localize('com_ui_custom_header_name')}
          </label>
          <input
            className={inputClasses}
            placeholder="X-Api-Key"
            {...register('api_key_custom_header')}
          />
        </div>
      )}
    </>
  );
};

const OAuth = ({ inputClasses }: { inputClasses: string }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { register, watch, formState } = useFormContext();
  const [isCopying, setIsCopying] = useState(false);
  const { errors } = formState;

  // Check if we're in edit mode (server exists with ID)
  const serverId = watch('server_id');
  const isEditMode = !!serverId;

  // Calculate redirect URI for edit mode
  const redirectUri = isEditMode
    ? `${window.location.origin}/api/mcp/${serverId}/oauth/callback`
    : '';

  const copyLink = useCopyToClipboard({ text: redirectUri });

  return (
    <>
      <label className="mb-1 block text-sm font-medium">
        {localize('com_ui_client_id')} {!isEditMode && <span className="text-red-500">*</span>}
      </label>
      <input
        placeholder={isEditMode ? localize('com_ui_leave_blank_to_keep') : ''}
        autoComplete="off"
        className={inputClasses}
        {...register('oauth_client_id', { required: !isEditMode })}
      />
      {errors.oauth_client_id && (
        <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
      )}
      <label className="mb-1 block text-sm font-medium">
        {localize('com_ui_client_secret')} {!isEditMode && <span className="text-red-500">*</span>}
      </label>
      <input
        placeholder={isEditMode ? localize('com_ui_leave_blank_to_keep') : ''}
        type="password"
        autoComplete="new-password"
        className={inputClasses}
        {...register('oauth_client_secret', { required: !isEditMode })}
      />
      {errors.oauth_client_secret && (
        <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
      )}
      <label className="mb-1 block text-sm font-medium">
        {localize('com_ui_auth_url')} <span className="text-red-500">*</span>
      </label>
      <input
        className={inputClasses}
        {...register('oauth_authorization_url', { required: true })}
      />
      {errors.oauth_authorization_url && (
        <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
      )}
      <label className="mb-1 block text-sm font-medium">
        {localize('com_ui_token_url')} <span className="text-red-500">*</span>
      </label>
      <input className={inputClasses} {...register('oauth_token_url', { required: true })} />
      {errors.oauth_token_url && (
        <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
      )}

      {/* Redirect URI - read-only in edit mode, info message in create mode */}
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_redirect_uri')}</label>
      {isEditMode ? (
        <div className="relative mb-2 flex items-center">
          <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover flex h-10 w-full rounded-lg border">
            <div className="flex-1 overflow-hidden">
              <div className="relative w-full">
                <input
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="w-full border-0 bg-transparent px-3 py-2 pr-12 text-sm text-text-secondary-alt focus:outline-none"
                  style={{ direction: 'rtl' }}
                />
              </div>
            </div>
            <div className="absolute right-0 flex h-full items-center pr-1">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  if (isCopying) {
                    return;
                  }
                  showToast({ message: localize('com_ui_copied_to_clipboard') });
                  copyLink(setIsCopying);
                }}
                className={cn('h-8 rounded-md px-2', isCopying ? 'cursor-default' : '')}
                aria-label={localize('com_ui_copy_link')}
              >
                {isCopying ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-2 rounded-lg border border-border-medium bg-surface-secondary p-2">
          <p className="text-xs text-text-secondary">{localize('com_ui_redirect_uri_info')}</p>
        </div>
      )}

      <label className="mb-1 block text-sm font-medium">{localize('com_ui_scope')}</label>
      <input className={inputClasses} {...register('oauth_scope')} />
    </>
  );
};
