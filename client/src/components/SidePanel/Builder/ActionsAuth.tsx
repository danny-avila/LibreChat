import { useFormContext } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import { OGDialogClose, OGDialogTitle, OGDialogHeader, OGDialogContent } from '~/components/ui/';
import { cn } from '~/utils';

export default function ActionsAuth({
  setOpenAuthDialog,
}: {
  setOpenAuthDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { watch, setValue, trigger } = useFormContext();
  const type = watch('type');

  return (
    <OGDialogContent className="w-full max-w-md border-none bg-surface-primary text-text-primary">
      <OGDialogHeader className="border-b border-border-light sm:p-3">
        <OGDialogTitle>Authentication</OGDialogTitle>
      </OGDialogHeader>
      <div className="p-4 sm:p-6 sm:pt-0">
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Authentication Type</label>
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
                None
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
                API Key
              </label>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor=":rfc:" className="flex cursor-pointer items-center gap-1">
                <RadioGroup.Item
                  type="button"
                  role="radio"
                  value={AuthTypeEnum.OAuth}
                  id=":rfc:"
                  className={cn(
                    'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                    'border-border-heavy bg-surface-primary',
                  )}
                >
                  <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                </RadioGroup.Item>
                OAuth
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
            <div className="flex w-full items-center justify-center gap-2 text-white">Save</div>
          </button>
          <OGDialogClose className="btn btn-neutral relative">
            <div className="flex w-full items-center justify-center gap-2">Cancel</div>
          </OGDialogClose>
        </div>
      </div>
    </OGDialogContent>
  );
}

const ApiKey = () => {
  const { register, watch, setValue } = useFormContext();
  const authorization_type = watch('authorization_type');
  const type = watch('type');
  return (
    <>
      <label className="mb-1 block text-sm font-medium">API Key</label>
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
      <label className="mb-1 block text-sm font-medium">Auth Type</label>
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
            Basic
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
            Bearer
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
            Custom
          </label>
        </div>
      </RadioGroup.Root>
      {authorization_type === AuthorizationTypeEnum.Custom && (
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium">Custom Header Name</label>
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

const OAuth = () => {
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
      <label className="mb-1 block text-sm font-medium">Client ID</label>
      <input
        placeholder="<HIDDEN>"
        type="new-password"
        autoComplete="off"
        className={inputClasses}
        {...register('oauth_client_id', { required: false })}
      />
      <label className="mb-1 block text-sm font-medium">Client Secret</label>
      <input
        placeholder="<HIDDEN>"
        type="new-password"
        autoComplete="off"
        className={inputClasses}
        {...register('oauth_client_secret', { required: false })}
      />
      <label className="mb-1 block text-sm font-medium">Authorization URL</label>
      <input
        className={inputClasses}
        {...register('authorization_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Token URL</label>
      <input
        className={inputClasses}
        {...register('client_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Scope</label>
      <input
        className={inputClasses}
        {...register('scope', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Token Exchange Method</label>
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
            Default (POST request)
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
            Basic authorization header
          </label>
        </div>
      </RadioGroup.Root>
    </>
  );
};
