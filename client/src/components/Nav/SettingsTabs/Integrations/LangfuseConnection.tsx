import { useState, useEffect, useRef } from 'react';
import {
  Button,
  CircleHelpIcon,
  Dropdown,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Input,
  Label,
  SecretInput,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type {
  TLangfuseConnectionStatus,
  TLangfuseConnectionTestErrorCode,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useGetLangfuseConnectionQuery,
  useUpdateLangfuseConnectionMutation,
  useTestLangfuseConnectionMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

type ConnectionTestState = 'idle' | 'unverified' | 'checking' | 'connected' | 'failed';

function getStoredConnectionTestKey(status?: TLangfuseConnectionStatus): string | undefined {
  if (status?.configured !== true || !status.destination || !status.publicKey) {
    return undefined;
  }

  return [status.destination, status.publicKey].join('\u0000');
}

function getConnectionStatusLabelKey(state: ConnectionTestState): TranslationKeys {
  switch (state) {
    case 'checking':
      return 'com_ui_langfuse_status_checking';
    case 'connected':
      return 'com_ui_langfuse_status_connected';
    case 'failed':
      return 'com_ui_langfuse_status_failed';
    case 'unverified':
      return 'com_ui_langfuse_status_not_verified';
    case 'idle':
    default:
      return 'com_ui_langfuse_status_not_configured';
  }
}

function getConnectionTestErrorLabelKey(
  errorCode?: TLangfuseConnectionTestErrorCode,
): TranslationKeys {
  switch (errorCode) {
    case 'invalid_credentials':
      return 'com_ui_langfuse_test_invalid_credentials';
    case 'access_denied':
      return 'com_ui_langfuse_test_access_denied';
    case 'rate_limited':
      return 'com_ui_langfuse_test_rate_limited';
    case 'server_error':
      return 'com_ui_langfuse_test_server_error';
    case 'timeout':
      return 'com_ui_langfuse_test_timeout';
    case 'missing_secret':
      return 'com_ui_langfuse_test_missing_secret';
    case 'stored_secret_unavailable':
      return 'com_ui_langfuse_test_stored_secret_unavailable';
    case 'unexpected_response':
      return 'com_ui_langfuse_test_unexpected_response';
    case 'unreachable':
    default:
      return 'com_ui_langfuse_test_error';
  }
}

function getConnectionStatusDotClass(state: ConnectionTestState): string {
  switch (state) {
    case 'connected':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    case 'checking':
      return 'bg-yellow-500';
    case 'idle':
    default:
      return 'border border-border-medium';
  }
}

function getDisplayPublicKey(publicKey: string): string {
  const trimmedPublicKey = publicKey.trim();
  if (trimmedPublicKey.length <= 12) {
    return trimmedPublicKey;
  }

  return `${trimmedPublicKey.slice(0, 6)}...${trimmedPublicKey.slice(-4)}`;
}

export default function LangfuseConnection() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const {
    data: status,
    isLoading: isConnectionLoading,
    isError: isConnectionError,
    isFetching: isConnectionFetching,
    refetch: refetchConnection,
  } = useGetLangfuseConnectionQuery();
  const updateMutation = useUpdateLangfuseConnectionMutation();
  const testMutation = useTestLangfuseConnectionMutation();

  const [connectionStatus, setConnectionStatus] = useState<TLangfuseConnectionStatus>();
  const [destination, setDestination] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isEditingPublicKey, setIsEditingPublicKey] = useState(false);
  const [isEditingSecretKey, setIsEditingSecretKey] = useState(false);
  const [connectionTestState, setConnectionTestState] = useState<ConnectionTestState>('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState('');
  const autoTestedConnectionRef = useRef<string>();
  const connectionTestRequestRef = useRef(0);
  const publicKeyInputRef = useRef<HTMLInputElement>(null);
  const secretKeyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingPublicKey) {
      publicKeyInputRef.current?.focus();
    }
  }, [isEditingPublicKey]);

  useEffect(() => {
    if (isEditingSecretKey) {
      secretKeyInputRef.current?.focus();
    }
  }, [isEditingSecretKey]);

  useEffect(() => {
    if (!status) {
      return;
    }
    setConnectionStatus(status);
  }, [status]);

  useEffect(() => {
    if (!connectionStatus) {
      return;
    }
    setDestination(connectionStatus.destination ?? '');
    setPublicKey(connectionStatus.publicKey ?? '');
  }, [connectionStatus]);

  const secretConfigured = connectionStatus?.configured === true;
  const destinations = connectionStatus?.destinations ?? [];
  const connectionDestinationAvailable = destinations.some(
    ({ key }) => key === connectionStatus?.destination,
  );
  const storedDestinationUnavailable =
    secretConfigured && Boolean(connectionStatus?.destination) && !connectionDestinationAvailable;
  const destinationOptions = [
    ...(storedDestinationUnavailable && connectionStatus?.destination
      ? [
          {
            value: connectionStatus.destination,
            label: `${connectionStatus.destination} - ${localize(
              'com_ui_langfuse_destination_unavailable',
            )}`,
          },
        ]
      : []),
    ...destinations.map(({ key, baseUrl }) => ({
      value: key,
      label: `${key} - ${baseUrl}`,
    })),
  ];
  const trimmedPublicKey = publicKey.trim();
  const trimmedSecretKey = secretKey.trim();
  const publicKeyInputVisible = !secretConfigured || isEditingPublicKey;
  const secretInputVisible = !secretConfigured || isEditingSecretKey;
  const displayPublicKey = getDisplayPublicKey(publicKey);
  const connectionCredentialsChanged =
    destination !== (connectionStatus?.destination ?? '') ||
    trimmedPublicKey !== (connectionStatus?.publicKey ?? '');
  const hasUnsavedChanges = connectionCredentialsChanged || trimmedSecretKey !== '';
  const isEditing =
    !secretConfigured || isEditingPublicKey || isEditingSecretKey || hasUnsavedChanges;
  const canSubmit =
    destination !== '' &&
    trimmedPublicKey !== '' &&
    ((!connectionCredentialsChanged && secretConfigured) || trimmedSecretKey !== '');
  const busy = testMutation.isLoading || updateMutation.isLoading;

  useEffect(() => {
    const storedConnectionTestKey = getStoredConnectionTestKey(connectionStatus);
    if (!connectionStatus) {
      return;
    }
    if (!storedConnectionTestKey) {
      return;
    }

    if (!connectionStatus.destinations?.some(({ key }) => key === connectionStatus.destination)) {
      connectionTestRequestRef.current += 1;
      setConnectionTestState('failed');
      setConnectionTestMessage(localize('com_ui_langfuse_destination_removed'));
      return;
    }

    if (autoTestedConnectionRef.current === storedConnectionTestKey) {
      return;
    }

    autoTestedConnectionRef.current = storedConnectionTestKey;
    const requestId = ++connectionTestRequestRef.current;
    setConnectionTestState('checking');
    testMutation.mutate(
      {
        destination: connectionStatus.destination ?? '',
        publicKey: connectionStatus.publicKey ?? '',
      },
      {
        onSuccess: (result) => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          setConnectionTestState(result.success ? 'connected' : 'failed');
          setConnectionTestMessage(
            result.success ? '' : localize(getConnectionTestErrorLabelKey(result.errorCode)),
          );
        },
        onError: () => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          setConnectionTestState('failed');
          setConnectionTestMessage(localize('com_ui_langfuse_test_error'));
        },
      },
    );
  }, [connectionStatus, localize, testMutation]);

  const connectionStatusLabel =
    connectionTestState === 'failed' && connectionTestMessage !== ''
      ? connectionTestMessage
      : localize(getConnectionStatusLabelKey(connectionTestState));
  const connectionStatusDotClass = getConnectionStatusDotClass(connectionTestState);
  const connectionStatusTextClass =
    connectionTestState === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-text-secondary';
  const connectionStatusTitle =
    connectionTestState === 'failed' ? localize('com_ui_langfuse_status_failed_hover') : undefined;

  const handleSave = () => {
    const payload = {
      enabled: true,
      destination,
      publicKey: trimmedPublicKey,
      ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
    };

    connectionTestRequestRef.current += 1;
    updateMutation.mutate(payload, {
      onSuccess: (nextStatus) => {
        autoTestedConnectionRef.current = getStoredConnectionTestKey(nextStatus);
        setConnectionStatus(nextStatus);
        setConnectionTestState('connected');
        setConnectionTestMessage('');
        setSecretKey('');
        setIsEditingPublicKey(false);
        setIsEditingSecretKey(false);
        showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
      },
      onError: () => {
        setConnectionTestState('failed');
        setConnectionTestMessage(localize('com_ui_langfuse_save_error'));
        showToast({ message: localize('com_ui_langfuse_save_error'), status: 'error' });
      },
    });
  };

  const handleCancel = () => {
    const storedDestination = connectionStatus?.destination;
    setDestination(storedDestination ?? '');
    setPublicKey(connectionStatus?.publicKey ?? '');
    setSecretKey('');
    setIsEditingPublicKey(false);
    setIsEditingSecretKey(false);

    if (!storedDestination || !connectionStatus?.publicKey) {
      setConnectionTestState('idle');
      setConnectionTestMessage('');
      return;
    }

    if (!connectionStatus.destinations?.some(({ key }) => key === storedDestination)) {
      connectionTestRequestRef.current += 1;
      setConnectionTestState('failed');
      setConnectionTestMessage(localize('com_ui_langfuse_destination_removed'));
      return;
    }

    const requestId = ++connectionTestRequestRef.current;
    setConnectionTestState('checking');
    setConnectionTestMessage('');
    testMutation.mutate(
      { destination: storedDestination, publicKey: connectionStatus.publicKey },
      {
        onSuccess: (result) => {
          if (requestId !== connectionTestRequestRef.current) return;
          setConnectionTestState(result.success ? 'connected' : 'failed');
          setConnectionTestMessage(
            result.success ? '' : localize(getConnectionTestErrorLabelKey(result.errorCode)),
          );
        },
        onError: () => {
          if (requestId !== connectionTestRequestRef.current) return;
          setConnectionTestState('failed');
          setConnectionTestMessage(localize('com_ui_langfuse_test_error'));
        },
      },
    );
  };

  const handleDestinationChange = (nextDestination: string) => {
    setDestination(nextDestination);
    const requestId = ++connectionTestRequestRef.current;
    const credentialsChanged =
      nextDestination !== (connectionStatus?.destination ?? '') ||
      trimmedPublicKey !== (connectionStatus?.publicKey ?? '');

    if (secretConfigured && credentialsChanged) {
      setIsEditingSecretKey(true);
    }

    if (
      nextDestination === '' ||
      trimmedPublicKey === '' ||
      ((!secretConfigured || credentialsChanged) && trimmedSecretKey === '')
    ) {
      setConnectionTestState(credentialsChanged ? 'unverified' : 'idle');
      setConnectionTestMessage('');
      return;
    }

    setConnectionTestState('checking');
    setConnectionTestMessage('');
    testMutation.mutate(
      {
        destination: nextDestination,
        publicKey: trimmedPublicKey,
        ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
      },
      {
        onSuccess: (result) => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          setConnectionTestState(result.success ? 'connected' : 'failed');
          setConnectionTestMessage(
            result.success ? '' : localize(getConnectionTestErrorLabelKey(result.errorCode)),
          );
        },
        onError: () => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          setConnectionTestState('failed');
          setConnectionTestMessage(localize('com_ui_langfuse_test_error'));
        },
      },
    );
  };

  const handleEnabledChange = () => {
    if (!secretConfigured || !connectionStatus?.destination || !connectionStatus.publicKey) {
      return;
    }

    const nextEnabled = connectionStatus.enabled !== true;
    const requestId = ++connectionTestRequestRef.current;
    const saveEnabledState = () => {
      updateMutation.mutate(
        {
          enabled: nextEnabled,
          destination: connectionStatus.destination ?? '',
          publicKey: connectionStatus.publicKey ?? '',
        },
        {
          onSuccess: (nextStatus) => {
            if (requestId !== connectionTestRequestRef.current) {
              return;
            }
            autoTestedConnectionRef.current = getStoredConnectionTestKey(nextStatus);
            setConnectionStatus(nextStatus);
            showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
          },
          onError: () => {
            if (requestId !== connectionTestRequestRef.current) {
              return;
            }
            showToast({ message: localize('com_ui_langfuse_save_error'), status: 'error' });
          },
        },
      );
    };

    saveEnabledState();
  };

  if (isConnectionLoading && connectionStatus == null) {
    return (
      <div
        data-testid="langfuse-connection-loading"
        className="flex items-center justify-center rounded-xl border border-border-light py-12"
      >
        <Spinner className="h-6 w-6 text-text-secondary" />
        <span className="sr-only">{localize('com_ui_loading')}</span>
      </div>
    );
  }

  if (isConnectionError && connectionStatus == null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border-light px-6 py-10 text-center">
        <p className="text-sm text-text-secondary">{localize('com_ui_langfuse_load_error')}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchConnection()}
          disabled={isConnectionFetching}
        >
          {localize('com_ui_retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HoverCard openDelay={50}>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{localize('com_ui_langfuse_title')}</div>
                <div className="rounded-full border border-purple-600/40 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-700/10 dark:text-purple-400">
                  {localize('com_ui_beta')}
                </div>
                <HoverCardTrigger>
                  <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
                </HoverCardTrigger>
              </div>
              <div className="mt-1 max-w-md text-xs text-text-secondary">
                {localize('com_ui_langfuse_description')}
              </div>
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs ${connectionStatusTextClass}`}
            aria-live="polite"
            title={connectionStatusTitle}
          >
            {connectionTestState === 'checking' ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <span className={`h-2 w-2 rounded-full ${connectionStatusDotClass}`} />
            )}
            <span>{connectionStatusLabel}</span>
          </div>
        </div>

        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <p className="text-sm text-text-secondary">{localize('com_ui_langfuse_beta_info')}</p>
          </HoverCardContent>
        </HoverCardPortal>
      </HoverCard>

      <div className="flex flex-col gap-1.5">
        <Label id="langfuse-destination-label">{localize('com_ui_langfuse_destination')}</Label>
        <Dropdown
          value={destination}
          label={destination === '' ? localize('com_ui_select') : ''}
          onChange={handleDestinationChange}
          options={destinationOptions}
          disabled={destinations.length === 0 || busy}
          className="w-full"
          sizeClasses="z-50 w-[var(--popover-anchor-width)]"
          testId="langfuse-destination"
          aria-labelledby="langfuse-destination-label"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-public-token">{localize('com_ui_langfuse_public_key')}</Label>
        {secretConfigured && !isEditingPublicKey && (
          <button
            type="button"
            className="w-full rounded-lg border border-border-light px-3 py-2 text-left hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={`${localize('com_ui_edit')} ${localize('com_ui_langfuse_public_key')}`}
            disabled={busy}
            onClick={() => setIsEditingPublicKey(true)}
          >
            <code className="block min-w-0 truncate font-mono text-sm text-text-primary">
              {displayPublicKey}
            </code>
          </button>
        )}
        {publicKeyInputVisible && (
          <Input
            ref={publicKeyInputRef}
            id="langfuse-public-token"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={publicKey}
            disabled={busy}
            placeholder="pk-lf-..."
            onChange={(e) => {
              connectionTestRequestRef.current += 1;
              const nextPublicKey = e.target.value;
              setPublicKey(nextPublicKey);
              if (
                secretConfigured &&
                nextPublicKey.trim() !== (connectionStatus?.publicKey ?? '')
              ) {
                setIsEditingSecretKey(true);
              }
              setConnectionTestState('unverified');
              setConnectionTestMessage('');
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-private-token">{localize('com_ui_langfuse_secret_key')}</Label>
        {secretConfigured && !isEditingSecretKey && (
          <button
            type="button"
            className="w-full rounded-lg border border-border-light px-3 py-2 text-left hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={`${localize('com_ui_edit')} ${localize('com_ui_langfuse_secret_key')}`}
            disabled={busy}
            onClick={() => setIsEditingSecretKey(true)}
          >
            <code className="block min-w-0 truncate font-mono text-sm text-text-primary">
              {connectionStatus?.secretKeyPreview}
            </code>
          </button>
        )}
        {secretInputVisible && (
          <SecretInput
            ref={secretKeyInputRef}
            id="langfuse-private-token"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={secretKey}
            disabled={busy}
            placeholder="sk-lf-..."
            onChange={(e) => {
              connectionTestRequestRef.current += 1;
              setSecretKey(e.target.value);
              setConnectionTestState('unverified');
              setConnectionTestMessage('');
            }}
          />
        )}
      </div>

      <div className="flex min-h-9 items-center justify-end gap-2">
        {isEditing ? (
          <>
            <Button variant="outline" disabled={busy} onClick={handleCancel}>
              {localize('com_ui_cancel')}
            </Button>
            <Button disabled={!canSubmit || busy} onClick={handleSave}>
              {testMutation.isLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {localize('com_ui_langfuse_testing')}
                </span>
              ) : (
                localize('com_ui_langfuse_save_and_enable')
              )}
            </Button>
          </>
        ) : (
          <Button
            variant={connectionStatus?.enabled === true ? 'outline' : 'submit'}
            disabled={
              busy || (connectionStatus?.enabled !== true && !connectionDestinationAvailable)
            }
            onClick={handleEnabledChange}
          >
            {localize(
              connectionStatus?.enabled === true
                ? 'com_ui_langfuse_disable'
                : 'com_ui_langfuse_enable',
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
