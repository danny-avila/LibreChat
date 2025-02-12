import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogTrigger,
} from '~/components/ui';
import { TranslationKeys, useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ActionsAuth({ disableOAuth }: { disableOAuth?: boolean }) {
  const localize = useLocalize();
  const [openAuthDialog, setOpenAuthDialog] = useState(false);
  const { watch, setValue, trigger } = useFormContext();
  const type = watch('type');

  return (
    <OGDialog open={openAuthDialog} onOpenChange={setOpenAuthDialog}>
      <OGDialogTrigger asChild>
        <div className="relative mb-4">
          <div className="mb-1.5 flex items-center">
            <label className="text-token-text-primary block font-medium">
              {localize('com_ui_authentication')}
            </label>
          </div>
          <div className="border-token-border-medium flex rounded-lg border text-sm hover:cursor-pointer">
            <div className="h-9 grow px-3 py-2">
              {localize(getAuthLocalizationKey(type))}
            </div>
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
      <OGDialogContent className="w-full max-w-md border-none bg-surface-primary text-text-primary">
        <OGDialogHeader className="border-b border-border-light sm:p-3">
          <OGDialogTitle>{localize('com_ui_authentication')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="p-4 sm:p-6 sm:pt-0">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">
              {localize('com_ui_authentication_type')}
            </label>
            <RadioGroup.Root
              defaultValue={AuthTypeEnum.None}
              onValueChange={(value) => setValue('type', value)}
              value={type}
              role="radiogroup"
              aria-required="false"
              dir="ltr"
              className="flex gap-4"
              style={{ outline: 'none' }}
            >
              <div className="flex items-center gap-2">
                <label htmlFor=":rf8:" className="flex cursor-pointer items-center gap-1">
                  <RadioGroup.Item
                    type="button"
                    role="radio"
                    value={AuthTypeEnum.None}
                    id=":rf8:"
                    className={cn(
                      'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                      'border-border-heavy bg-surface-primary',
                    )}
                  >
                    <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                  </RadioGroup.Item>
                  {localize('com_ui_none')}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor=":rfa:" className="flex cursor-pointer items-center gap-1">
                  <RadioGroup.Item
                    type="button"
                    role="radio"
                    value={AuthTypeEnum.ServiceHttp}
                    id=":rfa:"
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
                  htmlFor=":rfc:"
                  className={cn(
                    'flex items-center gap-1',
                    disableOAuth === true ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <RadioGroup.Item
                    type="button"
                    role="radio"
                    disabled={disableOAuth}
                    value={AuthTypeEnum.OAuth}
                    id=":rfc:"
                    className={cn(
                      'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                      'border-border-heavy bg-surface-primary',
                      disableOAuth === true ? 'cursor-not-allowed' : '',
                    )}
                  >
                    <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                  </RadioGroup.Item>
                  {localize('com_ui_oauth')}
                </label>
              </div>
            </RadioGroup.Root>
          </div>
          {type === 'none' ? null : type === 'service_http' ? <ApiKey /> : <OAuth />}
          {/* Cancel/Save */}
          <div className="mt-5 flex flex-col gap-3 sm:mt-4 sm:flex-row-reverse">
            <button
              className="btn relative bg-surface-submit text-primary-foreground hover:bg-surface-submit-hover"
              onClick={async () => {
                const result = await trigger(undefined, { shouldFocus: true });
                setValue('saved_auth_fields', result);
                setOpenAuthDialog(!result);
              }}
            >
              <div className="flex w-full items-center justify-center gap-2 text-white">
                {localize('com_ui_save')}
              </div>
            </button>
            <OGDialogClose className="btn btn-neutral relative">
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_ui_cancel')}
              </div>
            </OGDialogClose>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

const ApiKey = () => {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const authorization_type = watch('authorization_type');
  const type = watch('type');
  return (
    <>
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_api_key')}</label>
      <input
        placeholder="<HIDDEN>"
        type="new-password"
        autoComplete="new-password"
        className={cn(
          'mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm',
          'border-border-medium bg-surface-primary outline-none',
          'focus:ring-2 focus:ring-ring',
        )}
        {...register('api_key', { required: type === AuthTypeEnum.ServiceHttp })}
      />
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_auth_type')}</label>
      <RadioGroup.Root
        defaultValue={AuthorizationTypeEnum.Basic}
        onValueChange={(value) => setValue('authorization_type', value)}
        value={authorization_type}
        role="radiogroup"
        aria-required="true"
        dir="ltr"
        className="mb-2 flex gap-6 overflow-hidden rounded-lg"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor=":rfu:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Basic}
              id=":rfu:"
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
          <label htmlFor=":rg0:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Bearer}
              id=":rg0:"
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
          <label htmlFor=":rg2:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Custom}
              id=":rg2:"
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
            className={cn(
              'mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm',
              'border-border-medium bg-surface-primary outline-none',
              'focus:ring-2 focus:ring-ring',
            )}
            placeholder="X-Api-Key"
            {...register('custom_auth_header', {
              required: authorization_type === AuthorizationTypeEnum.Custom,
            })}
          />
        </div>
      )}
    </>
  );
};

/** Returns the appropriate localization key for authentication type */
function getAuthLocalizationKey(type: AuthTypeEnum): TranslationKeys {
  switch (type) {
    case AuthTypeEnum.ServiceHttp:
      return 'com_ui_api_key';
    case AuthTypeEnum.OAuth:
      return 'com_ui_oauth';
    default:
      return 'com_ui_none';
  }
}

const OAuth = () => {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const token_exchange_method = watch('token_exchange_method');
  const type = watch('type');

  const inputClasses = cn(
    'mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm',
    'border-border-medium bg-surface-primary outline-none',
    'focus:ring-2 focus:ring-ring',
  );

  return (
    <>
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_client_id')}</label>
      <input
        placeholder="<HIDDEN>"
        type="password"
        autoComplete="new-password"
        className={inputClasses}
        {...register('oauth_client_id', { required: false })}
      />
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_client_secret')}</label>
      <input
        placeholder="<HIDDEN>"
        type="password"
        autoComplete="new-password"
        className={inputClasses}
        {...register('oauth_client_secret', { required: false })}
      />
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_auth_url')}</label>
      <input
        className={inputClasses}
        {...register('authorization_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_token_url')}</label>
      <input
        className={inputClasses}
        {...register('client_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">{localize('com_ui_scope')}</label>
      <input
        className={inputClasses}
        {...register('scope', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">
        {localize('com_ui_token_exchange_method')}
      </label>
      <RadioGroup.Root
        defaultValue={AuthorizationTypeEnum.Basic}
        onValueChange={(value) => setValue('token_exchange_method', value)}
        value={token_exchange_method}
        role="radiogroup"
        aria-required="true"
        dir="ltr"
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor=":rj1:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={TokenExchangeMethodEnum.DefaultPost}
              id=":rj1:"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_default_post_request')}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor=":rj3:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={TokenExchangeMethodEnum.BasicAuthHeader}
              id=":rj3:"
              className={cn(
                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                'border-border-heavy bg-surface-primary',
              )}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
            </RadioGroup.Item>
            {localize('com_ui_basic_auth_header')}
          </label>
        </div>
      </RadioGroup.Root>
    </>
  );
};
