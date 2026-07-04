import { useState, useEffect } from 'react';
import { Button, Input, Label, SecretInput, Switch, useToastContext } from '@librechat/client';
import {
  useGetLangfuseConnectionQuery,
  useUpdateLangfuseConnectionMutation,
  useTestLangfuseConnectionMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function LangfuseConnection() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: status } = useGetLangfuseConnectionQuery();
  const updateMutation = useUpdateLangfuseConnectionMutation();
  const testMutation = useTestLangfuseConnectionMutation();

  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');

  useEffect(() => {
    if (!status) {
      return;
    }
    setEnabled(status.enabled === true);
    setBaseUrl(status.baseUrl ?? '');
    setPublicKey(status.publicKey ?? '');
  }, [status]);

  const secretConfigured = status?.configured === true;
  const trimmedBaseUrl = baseUrl.trim();
  const trimmedPublicKey = publicKey.trim();
  const trimmedSecretKey = secretKey.trim();
  const canSubmit =
    trimmedBaseUrl !== '' &&
    trimmedPublicKey !== '' &&
    (trimmedSecretKey !== '' || secretConfigured);

  const handleSave = () => {
    updateMutation.mutate(
      {
        enabled,
        baseUrl: trimmedBaseUrl,
        publicKey: trimmedPublicKey,
        ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
      },
      {
        onSuccess: () => {
          setSecretKey('');
          showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
        },
        onError: () =>
          showToast({ message: localize('com_ui_langfuse_save_error'), status: 'error' }),
      },
    );
  };

  const handleTest = () => {
    testMutation.mutate(
      {
        baseUrl: trimmedBaseUrl,
        publicKey: trimmedPublicKey,
        ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
      },
      {
        onSuccess: (result) =>
          showToast({
            message: result.success
              ? localize('com_ui_langfuse_test_success')
              : (result.message ?? localize('com_ui_langfuse_test_error')),
            status: result.success ? 'success' : 'error',
          }),
        onError: () =>
          showToast({ message: localize('com_ui_langfuse_test_error'), status: 'error' }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div id="langfuse-enabled-label" className="font-medium">
            {localize('com_ui_langfuse_title')}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {localize('com_ui_langfuse_description')}
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-labelledby="langfuse-enabled-label"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-base-url">{localize('com_ui_langfuse_base_url')}</Label>
        <Input
          id="langfuse-base-url"
          value={baseUrl}
          placeholder="https://cloud.langfuse.com"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-public-key">{localize('com_ui_langfuse_public_key')}</Label>
        <Input
          id="langfuse-public-key"
          value={publicKey}
          placeholder="pk-lf-..."
          onChange={(e) => setPublicKey(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="langfuse-secret-key">
            {localize('com_ui_langfuse_secret_key')}{' '}
            <span className="sr-only">
              ({secretConfigured ? localize('com_ui_set') : localize('com_ui_unset')})
            </span>
          </Label>
          <div
            aria-hidden="true"
            className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary"
          >
            <div
              className={
                secretConfigured
                  ? 'h-1.5 w-1.5 rounded-full bg-green-500'
                  : 'h-1.5 w-1.5 rounded-full border border-border-medium'
              }
            />
            <span>{secretConfigured ? localize('com_ui_set') : localize('com_ui_unset')}</span>
          </div>
        </div>
        <SecretInput
          id="langfuse-secret-key"
          autoComplete="new-password"
          controlsOnHover
          value={secretKey}
          placeholder={secretConfigured ? localize('com_ui_langfuse_secret_key_set') : 'sk-lf-...'}
          onChange={(e) => setSecretKey(e.target.value)}
        />
        <span className="text-xs text-text-tertiary">
          {localize('com_ui_langfuse_secret_key_hint')}
        </span>
        {secretConfigured && status?.secretKeyFingerprint != null && (
          <span className="text-xs text-text-tertiary">
            {localize('com_ui_langfuse_secret_key_fingerprint')}{' '}
            <code>{status.secretKeyFingerprint}</code>
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={!canSubmit || testMutation.isLoading}
          onClick={handleTest}
        >
          {localize('com_ui_langfuse_test')}
        </Button>
        <Button disabled={!canSubmit || updateMutation.isLoading} onClick={handleSave}>
          {localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}
