import { useState, useEffect, useRef } from 'react';
import {
  Button,
  CircleHelpIcon,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Input,
  Label,
  SecretInput,
  Spinner,
  Switch,
  useToastContext,
} from '@librechat/client';
import type { TLangfuseConnectionStatus } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useGetLangfuseConnectionQuery,
  useUpdateLangfuseConnectionMutation,
  useTestLangfuseConnectionMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

type ConnectionTestState = 'idle' | 'checking' | 'connected' | 'failed';

function getStoredConnectionTestKey(status?: TLangfuseConnectionStatus): string | undefined {
  if (status?.configured !== true || !status.destination || !status.publicKey) {
    return undefined;
  }

  return [status.destination, status.publicKey, status.updatedAt ?? ''].join('\u0000');
}

function getConnectionStatusLabelKey(state: ConnectionTestState): TranslationKeys {
  switch (state) {
    case 'checking':
      return 'com_ui_langfuse_status_checking';
    case 'connected':
      return 'com_ui_langfuse_status_connected';
    case 'failed':
      return 'com_ui_langfuse_status_failed';
    case 'idle':
    default:
      return 'com_ui_langfuse_status_not_configured';
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
  const { data: status } = useGetLangfuseConnectionQuery();
  const updateMutation = useUpdateLangfuseConnectionMutation();
  const testMutation = useTestLangfuseConnectionMutation();

  const [connectionStatus, setConnectionStatus] = useState<TLangfuseConnectionStatus>();
  const [enabled, setEnabled] = useState(false);
  const [destination, setDestination] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isEditingPublicKey, setIsEditingPublicKey] = useState(false);
  const [isEditingSecretKey, setIsEditingSecretKey] = useState(false);
  const [connectionTestState, setConnectionTestState] = useState<ConnectionTestState>('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState('');
  const autoTestedConnectionRef = useRef<string>();
  const connectionTestRequestRef = useRef(0);

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
    setEnabled(connectionStatus.enabled === true);
    const availableDestinations = connectionStatus.destinations ?? [];
    const storedDestination = availableDestinations.some(
      (option) => option.key === connectionStatus.destination,
    )
      ? connectionStatus.destination
      : undefined;
    setDestination(storedDestination ?? '');
    setPublicKey(connectionStatus.publicKey ?? '');
  }, [connectionStatus]);

  const secretConfigured = connectionStatus?.configured === true;
  const destinations = connectionStatus?.destinations ?? [];
  const trimmedPublicKey = publicKey.trim();
  const trimmedSecretKey = secretKey.trim();
  const publicKeyInputVisible = !secretConfigured || isEditingPublicKey;
  const secretInputVisible = !secretConfigured || isEditingSecretKey;
  const displayPublicKey = getDisplayPublicKey(publicKey);
  const hasUnsavedChanges =
    enabled !== (connectionStatus?.enabled === true) ||
    destination !== (connectionStatus?.destination ?? '') ||
    trimmedPublicKey !== (connectionStatus?.publicKey ?? '') ||
    trimmedSecretKey !== '';
  const showActions =
    !secretConfigured || isEditingPublicKey || isEditingSecretKey || hasUnsavedChanges;
  const canSubmit =
    destination !== '' && trimmedPublicKey !== '' && (secretConfigured || trimmedSecretKey !== '');

  useEffect(() => {
    const storedConnectionTestKey = getStoredConnectionTestKey(connectionStatus);
    if (!connectionStatus || !storedConnectionTestKey) {
      setConnectionTestState('idle');
      setConnectionTestMessage('');
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
          setConnectionTestMessage(result.success ? '' : (result.message ?? ''));
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
    const requestId = ++connectionTestRequestRef.current;
    const payload = {
      enabled,
      destination,
      publicKey: trimmedPublicKey,
      ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
    };

    const saveConnection = () => {
      updateMutation.mutate(payload, {
        onSuccess: (nextStatus) => {
          autoTestedConnectionRef.current = getStoredConnectionTestKey(nextStatus);
          setConnectionStatus(nextStatus);
          setConnectionTestState(enabled ? 'connected' : 'idle');
          setConnectionTestMessage('');
          setSecretKey('');
          setIsEditingPublicKey(false);
          setIsEditingSecretKey(false);
          showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
        },
        onError: () =>
          showToast({ message: localize('com_ui_langfuse_save_error'), status: 'error' }),
      });
    };

    if (!enabled) {
      saveConnection();
      return;
    }

    testMutation.mutate(
      {
        destination,
        publicKey: trimmedPublicKey,
        ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
      },
      {
        onSuccess: (result) => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          if (!result.success) {
            setConnectionTestState('failed');
            setConnectionTestMessage(result.message ?? localize('com_ui_langfuse_test_error'));
            showToast({
              message: result.message ?? localize('com_ui_langfuse_test_error'),
              status: 'error',
            });
            return;
          }

          setConnectionTestState('connected');
          setConnectionTestMessage('');
          saveConnection();
        },
        onError: () => {
          if (requestId !== connectionTestRequestRef.current) {
            return;
          }
          setConnectionTestState('failed');
          setConnectionTestMessage(localize('com_ui_langfuse_test_error'));
          showToast({ message: localize('com_ui_langfuse_test_error'), status: 'error' });
        },
      },
    );
  };

  const handleCancel = () => {
    const availableDestinations = connectionStatus?.destinations ?? [];
    const storedDestination = availableDestinations.some(
      (option) => option.key === connectionStatus?.destination,
    )
      ? connectionStatus?.destination
      : undefined;
    setEnabled(connectionStatus?.enabled === true);
    setDestination(storedDestination ?? '');
    setPublicKey(connectionStatus?.publicKey ?? '');
    setSecretKey('');
    setIsEditingPublicKey(false);
    setIsEditingSecretKey(false);
  };

  const handleDestinationChange = (nextDestination: string) => {
    setDestination(nextDestination);
    const requestId = ++connectionTestRequestRef.current;

    if (
      nextDestination === '' ||
      trimmedPublicKey === '' ||
      (!secretConfigured && trimmedSecretKey === '')
    ) {
      setConnectionTestState('idle');
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
          setConnectionTestMessage(result.success ? '' : (result.message ?? ''));
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

  return (
    <div className="flex flex-col gap-4">
      <HoverCard openDelay={50}>
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div id="langfuse-enabled-label" className="font-medium">
                  {localize('com_ui_langfuse_title')}
                </div>
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
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-labelledby="langfuse-enabled-label"
            />
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
        <Label htmlFor="langfuse-destination">{localize('com_ui_langfuse_destination')}</Label>
        <select
          id="langfuse-destination"
          className="flex h-9 w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary shadow-sm outline-none focus:ring-2 focus:ring-ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          value={destination}
          disabled={destinations.length === 0}
          onChange={(e) => handleDestinationChange(e.target.value)}
        >
          <option value="">{localize('com_ui_select')}</option>
          {destinations.map((option) => (
            <option key={option.key} value={option.key}>
              {option.key} - {option.baseUrl}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-public-key">{localize('com_ui_langfuse_public_key')}</Label>
        {secretConfigured && !isEditingPublicKey && (
          <button
            type="button"
            className="w-full rounded-lg border border-border-light px-3 py-2 text-left hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={`${localize('com_ui_edit')} ${localize('com_ui_langfuse_public_key')}`}
            onClick={() => setIsEditingPublicKey(true)}
          >
            <code className="block min-w-0 truncate font-mono text-sm text-text-primary">
              {displayPublicKey}
            </code>
          </button>
        )}
        {publicKeyInputVisible && (
          <Input
            id="langfuse-public-key"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            value={publicKey}
            placeholder="pk-lf-..."
            onChange={(e) => setPublicKey(e.target.value)}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="langfuse-secret-key">{localize('com_ui_langfuse_secret_key')}</Label>
        {secretConfigured && !isEditingSecretKey && (
          <button
            type="button"
            className="w-full rounded-lg border border-border-light px-3 py-2 text-left hover:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            aria-label={`${localize('com_ui_edit')} ${localize('com_ui_langfuse_secret_key')}`}
            onClick={() => setIsEditingSecretKey(true)}
          >
            <code className="block min-w-0 truncate font-mono text-sm text-text-primary">
              {connectionStatus?.displaySecretKey}
            </code>
          </button>
        )}
        {secretInputVisible && (
          <SecretInput
            id="langfuse-secret-key"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            controlsOnHover
            value={secretKey}
            placeholder="sk-lf-..."
            containerClassName="w-full"
            onChange={(e) => setSecretKey(e.target.value)}
          />
        )}
      </div>

      <div className="flex min-h-9 items-center justify-end gap-2">
        {showActions && (
          <>
            {secretConfigured && (
              <Button variant="outline" onClick={handleCancel}>
                {localize('com_ui_cancel')}
              </Button>
            )}
            <Button
              disabled={!canSubmit || testMutation.isLoading || updateMutation.isLoading}
              onClick={handleSave}
            >
              {testMutation.isLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {localize('com_ui_langfuse_testing')}
                </span>
              ) : (
                localize('com_ui_save')
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
