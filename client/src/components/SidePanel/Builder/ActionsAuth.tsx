import { useFormContext } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import { DialogContent } from '~/components/ui/';

export default function ActionsAuth({
  setOpenAuthDialog,
}: {
  setOpenAuthDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { watch, setValue, trigger } = useFormContext();
  const type = watch('type');
  return (
    <DialogContent
      role="dialog"
      id="radix-:rf5:"
      aria-describedby="radix-:rf7:"
      aria-labelledby="radix-:rf6:"
      data-state="open"
      className="left-1/2 col-auto col-start-2 row-auto row-start-2 w-full max-w-md -translate-x-1/2 rounded-xl bg-white pb-0 text-left shadow-xl transition-all dark:bg-gray-900 dark:text-gray-100"
      tabIndex={-1}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-between border-b border-black/10 px-4 pb-4 pt-5 dark:border-white/10 sm:p-6">
        <div className="flex">
          <div className="flex items-center">
            <div className="flex grow flex-col gap-1">
              <h2
                id="radix-:rf6:"
                className="text-token-text-primary text-lg font-medium leading-6"
              >
                Authentication
              </h2>
            </div>
          </div>
        </div>
      </div>
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
            tabIndex={0}
            style={{ outline: 'none' }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor=":rf8:" className="flex cursor-pointer items-center gap-1">
                <RadioGroup.Item
                  type="button"
                  role="radio"
                  value={AuthTypeEnum.None}
                  id=":rf8:"
                  className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
                  tabIndex={-1}
                >
                  <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
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
                  className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
                  tabIndex={0}
                >
                  <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
                </RadioGroup.Item>
                API Key
              </label>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <label htmlFor=":rfc:" className="flex cursor-not-allowed items-center gap-1">
                <RadioGroup.Item
                  type="button"
                  role="radio"
                  disabled={true}
                  value={AuthTypeEnum.OAuth}
                  id=":rfc:"
                  className="mr-1 flex h-5 w-5 cursor-not-allowed items-center justify-center rounded-full border border-gray-500 bg-gray-300 dark:border-gray-600 dark:bg-gray-900"
                  tabIndex={-1}
                >
                  <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
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
            className="btn relative bg-green-500 text-white hover:bg-green-600 dark:hover:bg-green-600"
            onClick={async () => {
              const result = await trigger(undefined, { shouldFocus: true });
              setValue('saved_auth_fields', result);
              setOpenAuthDialog(!result);
            }}
          >
            <div className="flex w-full items-center justify-center gap-2">Save</div>
          </button>
          <DialogPrimitive.Close className="btn btn-neutral relative">
            <div className="flex w-full items-center justify-center gap-2">Cancel</div>
          </DialogPrimitive.Close>
        </div>
      </div>
    </DialogContent>
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
        type="password"
        autoComplete="off"
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
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
        tabIndex={0}
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor=":rfu:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={AuthorizationTypeEnum.Basic}
              id=":rfu:"
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
              tabIndex={-1}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
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
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
              tabIndex={-1}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
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
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
              tabIndex={0}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
            </RadioGroup.Item>
            Custom
          </label>
        </div>
      </RadioGroup.Root>
      {authorization_type === AuthorizationTypeEnum.Custom && (
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium">Custom Header Name</label>
          <input
            className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
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
  return (
    <>
      <label className="mb-1 block text-sm font-medium">Client ID</label>
      <input
        placeholder="<HIDDEN>"
        type="password"
        autoComplete="off"
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
        {...register('oauth_client_id', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Client Secret</label>
      <input
        placeholder="<HIDDEN>"
        type="password"
        autoComplete="off"
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
        {...register('oauth_client_secret', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Authorization URL</label>
      <input
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
        {...register('authorization_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Token URL</label>
      <input
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
        {...register('client_url', { required: type === AuthTypeEnum.OAuth })}
      />
      <label className="mb-1 block text-sm font-medium">Scope</label>
      <input
        className="border-token-border-medium mb-2 h-9 w-full resize-none overflow-y-auto rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800"
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
        tabIndex={0}
        style={{ outline: 'none' }}
      >
        <div className="flex items-center gap-2">
          <label htmlFor=":rj1:" className="flex cursor-pointer items-center gap-1">
            <RadioGroup.Item
              type="button"
              role="radio"
              value={TokenExchangeMethodEnum.DefaultPost}
              id=":rj1:"
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
              tabIndex={-1}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
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
              className="mr-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-500 bg-white dark:border-gray-600 dark:bg-gray-700"
              tabIndex={-1}
            >
              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-gray-950 dark:bg-white"></RadioGroup.Indicator>
            </RadioGroup.Item>
            Basic authorization header
          </label>
        </div>
      </RadioGroup.Root>
    </>
  );
};
