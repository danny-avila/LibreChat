import { useEffect, useRef, useState } from 'react';
import type { LangfuseConnectionStatus } from '~/admin/api';
import type * as t from '~/admin/types';
import {
  getLangfuseConnectionFn,
  LANGFUSE_CONNECTION_QUERY_KEY,
  testLangfuseConnectionFn,
  updateLangfuseConnectionFn,
} from '~/admin/api';
import { focusElement, notifyError, notifySuccess } from '~/admin/utils';
import { useMutation, useQuery, useQueryClient } from '~/admin/query';
import { Button, Select, TextField } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

type VerificationState = 'idle' | 'unverified' | 'checking' | 'verified' | 'failed';

function getConnectionKey(status?: LangfuseConnectionStatus): string | undefined {
  if (!status?.configured || !status.destination || !status.publicKey) return undefined;
  return `${status.destination}\u0000${status.publicKey}`;
}

function maskPublicKey(publicKey: string): string {
  const trimmed = publicKey.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function getVerificationLabel(
  state: VerificationState,
  message: string,
  localize: ReturnType<typeof useLocalize>,
): string {
  switch (state) {
    case 'checking':
      return localize('com_admin_config_langfuse_checking');
    case 'verified':
      return localize('com_admin_config_langfuse_verified');
    case 'failed':
      return message || localize('com_admin_config_langfuse_test_fail');
    case 'unverified':
      return localize('com_admin_config_langfuse_not_verified');
    default:
      return localize('com_admin_config_langfuse_not_configured');
  }
}

function getVerificationDotClass(state: VerificationState): string {
  switch (state) {
    case 'verified':
      return 'bg-(--cui-color-accent-success)';
    case 'failed':
      return 'bg-(--cui-color-accent-danger)';
    case 'checking':
      return 'bg-(--cui-color-accent-warning)';
    default:
      return 'border border-(--cui-color-stroke-default)';
  }
}

export function LangfuseRenderer({ disabled, isEditingScope }: t.FieldRendererProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LangfuseConnectionStatus>();
  const [destination, setDestination] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [editingPublicKey, setEditingPublicKey] = useState(false);
  const [editingSecretKey, setEditingSecretKey] = useState(false);
  const [verificationState, setVerificationState] = useState<VerificationState>('idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  const testedConnectionRef = useRef<string | undefined>(undefined);
  const requestRef = useRef(0);
  const hasDraftRef = useRef(false);

  const connectionQuery = useQuery({
    queryKey: LANGFUSE_CONNECTION_QUERY_KEY,
    queryFn: () => getLangfuseConnectionFn(),
    enabled: !isEditingScope,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const updateMutation = useMutation({
    mutationFn: (data: {
      enabled: boolean;
      destination: string;
      publicKey: string;
      secretKey?: string;
    }) => updateLangfuseConnectionFn({ data }),
  });
  const testMutation = useMutation({
    mutationFn: (data: { destination: string; publicKey: string; secretKey?: string }) =>
      testLangfuseConnectionFn({ data }),
  });
  /* `mutate` is stable across renders, so the verification effect can depend on it. */
  const { mutate: testConnection } = testMutation;

  useEffect(() => {
    if (!connectionQuery.data) return;
    if (hasDraftRef.current) return;
    const nextStatus = connectionQuery.data;
    setStatus(nextStatus);
    // Preserve the stored destination for display even when the server dropped it from the
    // allowlist. Blanking it made destinationChanged true, forcing edit mode and leaving an
    // enabled connection impossible to disable until a replacement was picked; a de-allowlisted
    // destination now simply shows as unselected in the picker while disable stays available.
    setDestination(nextStatus.destination ?? '');
    setPublicKey(nextStatus.publicKey ?? '');
  }, [connectionQuery.data]);

  useEffect(() => {
    const connectionKey = getConnectionKey(status);
    if (!connectionKey) {
      setVerificationState('idle');
      setVerificationMessage('');
      return;
    }
    // Read-only viewers lack manage:configs:langfuse and cannot run verification. Show the stored
    // connection as unverified rather than "not configured", and clear the in-flight and
    // tested-connection markers so switching back to editable re-verifies from scratch.
    if (disabled) {
      requestRef.current += 1;
      testedConnectionRef.current = undefined;
      setVerificationState('unverified');
      setVerificationMessage('');
      return;
    }
    if (testedConnectionRef.current === connectionKey) return;

    testedConnectionRef.current = connectionKey;
    const requestId = ++requestRef.current;
    setVerificationState('checking');
    setVerificationMessage('');
    testConnection(
      { destination: status?.destination ?? '', publicKey: status?.publicKey ?? '' },
      {
        onSuccess: (result) => {
          if (requestId !== requestRef.current) return;
          testedConnectionRef.current = connectionKey;
          setVerificationState(result.success ? 'verified' : 'failed');
          setVerificationMessage(result.success ? '' : (result.message ?? ''));
        },
        onError: (error: Error) => {
          if (requestId !== requestRef.current) return;
          if (testedConnectionRef.current === connectionKey) {
            testedConnectionRef.current = undefined;
          }
          setVerificationState('failed');
          setVerificationMessage(error.message);
        },
      },
    );
  }, [status, connectionQuery.dataUpdatedAt, disabled, testConnection]);

  if (isEditingScope) {
    return (
      <p className="text-sm text-(--cui-color-text-muted)">
        {localize('com_admin_config_langfuse_tenant_wide')}
      </p>
    );
  }

  if (connectionQuery.isPending) {
    return (
      <p className="text-sm text-(--cui-color-text-muted)">{localize('com_admin_ui_loading')}</p>
    );
  }

  if (connectionQuery.isError) {
    return (
      <p role="alert" className="text-sm text-(--cui-color-text-danger)">
        {connectionQuery.error.message}
      </p>
    );
  }

  const configured = status?.configured === true;
  const trimmedPublicKey = publicKey.trim();
  const trimmedSecretKey = secretKey.trim();
  const destinationChanged = destination !== (status?.destination ?? '');
  const publicKeyChanged = trimmedPublicKey !== (status?.publicKey ?? '');
  const isEditing =
    !configured ||
    editingPublicKey ||
    editingSecretKey ||
    destinationChanged ||
    publicKeyChanged ||
    trimmedSecretKey !== '';
  const canSave =
    !disabled &&
    destination !== '' &&
    trimmedPublicKey !== '' &&
    (configured || trimmedSecretKey !== '');
  const busy = updateMutation.isPending || testMutation.isPending;

  const markDraftUnverified = () => {
    hasDraftRef.current = true;
    requestRef.current += 1;
    setVerificationState('unverified');
    setVerificationMessage('');
  };

  const verify = (
    nextDestination: string,
    nextPublicKey: string,
    nextSecretKey: string,
    onVerified?: () => void,
  ) => {
    const requestId = ++requestRef.current;
    if (!nextDestination || !nextPublicKey || (!configured && !nextSecretKey)) {
      setVerificationState('idle');
      setVerificationMessage('');
      return;
    }

    setVerificationState('checking');
    setVerificationMessage('');
    testMutation.mutate(
      {
        destination: nextDestination,
        publicKey: nextPublicKey,
        ...(nextSecretKey ? { secretKey: nextSecretKey } : {}),
      },
      {
        onSuccess: (result) => {
          if (requestId !== requestRef.current) return;
          setVerificationState(result.success ? 'verified' : 'failed');
          setVerificationMessage(result.success ? '' : (result.message ?? ''));
          if (result.success) onVerified?.();
        },
        onError: (error: Error) => {
          if (requestId !== requestRef.current) return;
          setVerificationState('failed');
          setVerificationMessage(error.message);
        },
      },
    );
  };

  const saveConnection = () => {
    const payload = {
      // Credential edits are committed through the explicit "Save & enable" action.
      enabled: true,
      destination,
      publicKey: trimmedPublicKey,
      ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
    };
    updateMutation.mutate(payload, {
      onSuccess: (nextStatus) => {
        hasDraftRef.current = false;
        queryClient.setQueryData(LANGFUSE_CONNECTION_QUERY_KEY, nextStatus);
        testedConnectionRef.current = getConnectionKey(nextStatus);
        setStatus(nextStatus);
        setDestination(nextStatus.destination ?? '');
        setPublicKey(nextStatus.publicKey ?? '');
        setSecretKey('');
        setEditingPublicKey(false);
        setEditingSecretKey(false);
        notifySuccess(localize('com_admin_config_langfuse_saved'));
      },
      onError: (error: Error) => notifyError(error.message),
    });
  };

  const handleSave = () => {
    verify(destination, trimmedPublicKey, trimmedSecretKey, saveConnection);
  };

  const handleCancel = () => {
    hasDraftRef.current = false;
    const latestStatus =
      queryClient.getQueryData<LangfuseConnectionStatus>(LANGFUSE_CONNECTION_QUERY_KEY) ?? status;
    setStatus(latestStatus);
    const storedDestination = latestStatus?.destination;
    setDestination(storedDestination ?? '');
    setPublicKey(latestStatus?.publicKey ?? '');
    setSecretKey('');
    setEditingPublicKey(false);
    setEditingSecretKey(false);
    if (latestStatus?.configured && storedDestination && latestStatus.publicKey) {
      verify(storedDestination, latestStatus.publicKey, '');
    } else {
      setVerificationState('idle');
      setVerificationMessage('');
    }
  };

  const handleEnabledChange = () => {
    if (!configured || !status?.destination || !status.publicKey) return;

    const nextEnabled = status.enabled !== true;
    updateMutation.mutate(
      {
        enabled: nextEnabled,
        destination: status.destination,
        publicKey: status.publicKey,
      },
      {
        onSuccess: (nextStatus) => {
          queryClient.setQueryData(LANGFUSE_CONNECTION_QUERY_KEY, nextStatus);
          testedConnectionRef.current = getConnectionKey(nextStatus);
          setStatus(nextStatus);
          notifySuccess(localize('com_admin_config_langfuse_saved'));
        },
        onError: (error: Error) => notifyError(error.message),
      },
    );
  };

  const statusLabel = getVerificationLabel(verificationState, verificationMessage, localize);
  const statusDotClass = getVerificationDotClass(verificationState);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {localize('com_admin_config_langfuse_enabled')}
          </span>
          <span className="text-3xs w-fit rounded-full border border-(--cui-color-stroke-default) px-2 py-0.5 font-medium text-(--cui-color-text-muted)">
            {localize('com_admin_config_langfuse_beta')}
          </span>
        </div>
        <span className="text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_config_langfuse_description')}
        </span>
      </div>

      <div
        className="flex items-center gap-2 text-xs text-(--cui-color-text-muted)"
        aria-live="polite"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`} />
        <span>{statusLabel}</span>
      </div>

      <Select
        label={localize('com_admin_config_langfuse_destination')}
        value={destination || undefined}
        placeholder={localize('com_admin_config_langfuse_select_destination')}
        disabled={disabled || busy || (status?.destinations.length ?? 0) === 0}
        onSelect={(value) => {
          hasDraftRef.current = true;
          setDestination(value);
          verify(value, trimmedPublicKey, trimmedSecretKey);
        }}
      >
        {status?.destinations.map(({ key, baseUrl }) => (
          <Select.Item key={key} value={key}>
            {key} - {baseUrl}
          </Select.Item>
        ))}
      </Select>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {localize('com_admin_config_langfuse_public_key')}
        </span>
        {configured && !editingPublicKey ? (
          <button
            type="button"
            className="rounded-md border border-(--cui-color-stroke-default) px-3 py-2 text-left hover:border-(--cui-color-stroke-emphasis) focus-visible:outline-2 focus-visible:outline-(--cui-color-stroke-emphasis)"
            disabled={disabled || busy}
            onClick={() => {
              hasDraftRef.current = true;
              setEditingPublicKey(true);
            }}
            aria-label={`${localize('com_admin_ui_edit')} ${localize('com_admin_config_langfuse_public_key')}`}
          >
            <code className="text-sm">{maskPublicKey(publicKey)}</code>
          </button>
        ) : (
          <TextField
            id="langfuse-public-token"
            name="langfuse-public-token"
            label=""
            ref={editingPublicKey ? focusElement : undefined}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={publicKey}
            disabled={disabled || busy}
            placeholder="pk-lf-..."
            onChange={(value) => {
              setPublicKey(value);
              markDraftUnverified();
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {localize('com_admin_config_langfuse_secret_key')}
        </span>
        {configured && !editingSecretKey ? (
          <button
            type="button"
            className="rounded-md border border-(--cui-color-stroke-default) px-3 py-2 text-left hover:border-(--cui-color-stroke-emphasis) focus-visible:outline-2 focus-visible:outline-(--cui-color-stroke-emphasis)"
            disabled={disabled || busy}
            onClick={() => {
              hasDraftRef.current = true;
              setEditingSecretKey(true);
            }}
            aria-label={`${localize('com_admin_ui_edit')} ${localize('com_admin_config_langfuse_secret_key')}`}
          >
            <code className="text-sm">{status?.displaySecretKey}</code>
          </button>
        ) : (
          <TextField
            id="langfuse-private-token"
            name="langfuse-private-token"
            label=""
            ref={editingSecretKey ? focusElement : undefined}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={secretKey}
            disabled={disabled || busy}
            placeholder="sk-lf-..."
            onChange={(value) => {
              setSecretKey(value);
              markDraftUnverified();
            }}
          />
        )}
      </div>

      <div className="flex min-h-9 items-center justify-end gap-2">
        {isEditing ? (
          <>
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              disabled={disabled || busy}
              onClick={handleCancel}
            />
            <Button
              htmlType="button"
              type="primary"
              label={
                testMutation.isPending
                  ? localize('com_admin_config_langfuse_checking')
                  : localize('com_admin_config_langfuse_save_and_enable')
              }
              loading={busy}
              disabled={!canSave || busy}
              onClick={handleSave}
            />
          </>
        ) : (
          <Button
            htmlType="button"
            type={status?.enabled === true ? 'secondary' : 'primary'}
            label={localize(
              status?.enabled === true
                ? 'com_admin_config_langfuse_disable'
                : 'com_admin_config_langfuse_enable',
            )}
            disabled={disabled || busy}
            loading={updateMutation.isPending}
            onClick={handleEnabledChange}
          />
        )}
      </div>
    </div>
  );
}
