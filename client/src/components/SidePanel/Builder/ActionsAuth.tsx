import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { ChevronRight, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  AuthTypeEnum,
  AuthorizationTypeEnum,
  TokenExchangeMethodEnum,
} from 'librechat-data-provider';
import {
  Input,
  Button,
  OGDialog,
  SecretInput,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogDescription,
} from '@librechat/client';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AuthMethod {
  value: AuthTypeEnum;
  icon: LucideIcon;
  titleKey: TranslationKeys;
  descKey: TranslationKeys;
}

const AUTH_METHODS: AuthMethod[] = [
  {
    value: AuthTypeEnum.None,
    icon: ShieldOff,
    titleKey: 'com_ui_none',
    descKey: 'com_ui_auth_none_desc',
  },
  {
    value: AuthTypeEnum.ServiceHttp,
    icon: KeyRound,
    titleKey: 'com_ui_api_key',
    descKey: 'com_ui_auth_apikey_desc',
  },
  {
    value: AuthTypeEnum.OAuth,
    icon: ShieldCheck,
    titleKey: 'com_ui_oauth',
    descKey: 'com_ui_auth_oauth_desc',
  },
];

export default function ActionsAuth({ disableOAuth }: { disableOAuth?: boolean }) {
  const localize = useLocalize();
  const [openAuthDialog, setOpenAuthDialog] = useState(false);
  const { watch, setValue, trigger } = useFormContext();
  const type = watch('type');
  const current = AUTH_METHODS.find((method) => method.value === type) ?? AUTH_METHODS[0];

  const handleSave = async () => {
    const result = await trigger(undefined, { shouldFocus: true });
    setValue('saved_auth_fields', result);
    setOpenAuthDialog(!result);
  };

  return (
    <OGDialog open={openAuthDialog} onOpenChange={setOpenAuthDialog}>
      <div className="mb-4">
        <label className="mb-1.5 block font-medium text-text-primary">
          {localize('com_ui_authentication')}
        </label>
        <OGDialogTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-3 rounded-xl border border-border-medium bg-surface-primary px-3 py-2.5 text-left transition-colors hover:border-border-heavy hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <current.icon className="size-5 shrink-0 text-text-secondary" aria-hidden={true} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text-primary">
                {localize(current.titleKey)}
              </span>
              <span className="block truncate text-xs text-text-secondary">
                {localize(current.descKey)}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
              aria-hidden={true}
            />
          </button>
        </OGDialogTrigger>
      </div>
      <OGDialogContent className="w-full max-w-lg overflow-hidden bg-surface-primary p-0 text-text-primary">
        <OGDialogHeader className="space-y-1 border-b border-border-light px-6 py-4 pr-10">
          <OGDialogTitle className="text-lg font-semibold">
            {localize('com_ui_authentication')}
          </OGDialogTitle>
          <OGDialogDescription>{localize('com_ui_authentication_desc')}</OGDialogDescription>
        </OGDialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <RadioGroup.Root
            value={type}
            onValueChange={(value) => setValue('type', value)}
            aria-label={localize('com_ui_authentication_type')}
            className="flex flex-col gap-2"
          >
            {AUTH_METHODS.map((method) => {
              const selected = type === method.value;
              const disabled = method.value === AuthTypeEnum.OAuth && disableOAuth === true;
              return (
                <RadioGroup.Item
                  key={method.value}
                  value={method.value}
                  disabled={disabled}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    selected
                      ? 'border-border-heavy bg-surface-active'
                      : 'border-border-light hover:border-border-medium hover:bg-surface-hover',
                  )}
                >
                  <method.icon
                    className={cn(
                      'size-5 shrink-0',
                      selected ? 'text-text-primary' : 'text-text-secondary',
                    )}
                    aria-hidden={true}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">
                      {localize(method.titleKey)}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      {localize(method.descKey)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border',
                      selected ? 'border-text-primary' : 'border-border-heavy',
                    )}
                  >
                    {selected && <span className="size-2 rounded-full bg-text-primary" />}
                  </span>
                </RadioGroup.Item>
              );
            })}
          </RadioGroup.Root>

          {type !== AuthTypeEnum.None && (
            <div className="mt-5 space-y-4 border-t border-border-light pt-5">
              {type === AuthTypeEnum.ServiceHttp ? <ApiKey /> : <OAuth />}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-light px-6 py-4">
          <OGDialogClose asChild>
            <Button variant="outline">{localize('com_ui_cancel')}</Button>
          </OGDialogClose>
          <Button variant="submit" onClick={handleSave}>
            {localize('com_ui_save')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

function Field({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedField({
  id,
  label,
  value,
  onValueChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; labelKey: TranslationKeys }>;
}) {
  const localize = useLocalize();
  return (
    <div className="space-y-1.5">
      <label id={id} className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <RadioGroup.Root
        value={value}
        onValueChange={onValueChange}
        aria-labelledby={id}
        className="inline-flex w-full rounded-lg border border-border-light p-0.5"
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              value === option.value
                ? 'bg-surface-active text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {localize(option.labelKey)}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

const ApiKey = () => {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const authorization_type = watch('authorization_type');
  const type = watch('type');
  return (
    <>
      <Field htmlFor="auth-api-key" label={localize('com_ui_api_key')}>
        <SecretInput
          id="auth-api-key"
          autoComplete="new-password"
          controlsOnHover
          placeholder="<HIDDEN>"
          {...register('api_key', { required: type === AuthTypeEnum.ServiceHttp })}
        />
      </Field>
      <SegmentedField
        id="auth-type-label"
        label={localize('com_ui_auth_type')}
        value={authorization_type}
        onValueChange={(value) => setValue('authorization_type', value)}
        options={[
          { value: AuthorizationTypeEnum.Basic, labelKey: 'com_ui_basic' },
          { value: AuthorizationTypeEnum.Bearer, labelKey: 'com_ui_bearer' },
          { value: AuthorizationTypeEnum.Custom, labelKey: 'com_ui_custom' },
        ]}
      />
      {authorization_type === AuthorizationTypeEnum.Custom && (
        <Field htmlFor="auth-custom-header" label={localize('com_ui_custom_header_name')}>
          <Input
            id="auth-custom-header"
            placeholder="X-Api-Key"
            {...register('custom_auth_header', {
              required: authorization_type === AuthorizationTypeEnum.Custom,
            })}
          />
        </Field>
      )}
    </>
  );
};

const OAuth = () => {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const token_exchange_method = watch('token_exchange_method');
  const type = watch('type');
  return (
    <>
      <Field htmlFor="auth-client-id" label={localize('com_ui_client_id')}>
        <SecretInput
          id="auth-client-id"
          autoComplete="new-password"
          controlsOnHover
          placeholder="<HIDDEN>"
          {...register('oauth_client_id', { required: false })}
        />
      </Field>
      <Field htmlFor="auth-client-secret" label={localize('com_ui_client_secret')}>
        <SecretInput
          id="auth-client-secret"
          autoComplete="new-password"
          controlsOnHover
          placeholder="<HIDDEN>"
          {...register('oauth_client_secret', { required: false })}
        />
      </Field>
      <Field htmlFor="auth-authorization-url" label={localize('com_ui_auth_url')}>
        <Input
          id="auth-authorization-url"
          {...register('authorization_url', { required: type === AuthTypeEnum.OAuth })}
        />
      </Field>
      <Field htmlFor="auth-token-url" label={localize('com_ui_token_url')}>
        <Input
          id="auth-token-url"
          {...register('client_url', { required: type === AuthTypeEnum.OAuth })}
        />
      </Field>
      <Field htmlFor="auth-scope" label={localize('com_ui_scope')}>
        <Input id="auth-scope" {...register('scope', { required: type === AuthTypeEnum.OAuth })} />
      </Field>
      <SegmentedField
        id="auth-token-exchange-label"
        label={localize('com_ui_token_exchange_method')}
        value={token_exchange_method}
        onValueChange={(value) => setValue('token_exchange_method', value)}
        options={[
          { value: TokenExchangeMethodEnum.DefaultPost, labelKey: 'com_ui_default_post_request' },
          { value: TokenExchangeMethodEnum.BasicAuthHeader, labelKey: 'com_ui_basic_auth_header' },
        ]}
      />
    </>
  );
};
