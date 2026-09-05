import { useState, useEffect, useRef } from 'react';
import {
  Button,
  CircleHelpIcon,
  Dropdown,
  Input,
  Label,
  SecretInput,
  Spinner,
  useToastContext,
} from '@librechat/client';
import {
  Root as Popover,
  Portal as PopoverPortal,
  Trigger as PopoverTrigger,
  Content as PopoverContent,
} from '@radix-ui/react-popover';
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

type ConnectionTestState = 'idle' | 'inactive' | 'unverified' | 'checking' | 'connected' | 'failed';

type VersionedTenant = Pick<TLangfuseConnectionStatus, 'configVersion' | 'effectiveTenantId'>;

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
    case 'inactive':
      return 'com_ui_langfuse_status_inactive';
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
      return 'bg-status-success';
    case 'failed':
      return 'bg-status-error';
    case 'checking':
      return 'bg-status-warning';
    case 'idle':
    default:
      return 'border border-border-medium';
  }
}

/**
 * A 409 body carries the server's current version, but resending it as the
 * next `expectedVersion` without also refreshing the fields it belongs to is
 * exactly the unsafe retry this component must avoid — so the version out of
 * the error body is never used; only whether the status is 409 matters.
 */
function isVersionConflict(error: unknown): boolean {
  return (error as { response?: { status?: number } } | undefined)?.response?.status === 409;
}

function isTenantConflict(error: unknown): boolean {
  return (
    (error as { response?: { data?: { error?: string } } } | undefined)?.response?.data?.error ===
    'Tenant context changed'
  );
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
  /** CAS tokens for the next write. Tracked together and separately from
   *  `connectionStatus` so a conflict can advance them without resetting the
   *  form fields, and a tenant refresh cannot pair one tenant's ID with
   *  another tenant's version. */
  const [writeBaseline, setWriteBaseline] = useState<{
    expectedVersion: number | null;
    expectedTenantId: string;
  }>({ expectedVersion: null, expectedTenantId: '' });
  const autoTestedConnectionRef = useRef<string>();
  const connectionTestRequestRef = useRef(0);
  const publicKeyInputRef = useRef<HTMLInputElement>(null);
  const secretKeyInputRef = useRef<HTMLInputElement>(null);
  /**
   * Whether this field's current value differs from `connectionStatus` right
   * now — re-derived on every change against that moment's baseline, not
   * "was this ever edited," so typing away and back to the original value
   * clears it again. A background sync must not clobber a real divergence
   * with the refetched value; only fields that still match get the fresh
   * baseline. Reset (to false, since the local value then *is* the new
   * baseline) once a save succeeds.
   */
  const destinationTouchedRef = useRef(false);
  const publicKeyTouchedRef = useRef(false);
  /**
   * Mirrors of `destination`/`publicKey` state. `applyFreshRecord` must read
   * these instead of the state variables directly: it's called from
   * `rebaseOnConflict`'s `refetchConnection().then(...)` callback, a closure
   * captured at the moment the conflict was handled — if the admin edits
   * destination/publicKey while that refetch is still pending (inputs stay
   * editable; `busy` doesn't cover the refetch), the callback's own
   * closed-over `destination`/`publicKey` would still be the PRE-edit
   * values. Comparing against those stale values instead of the truly-current
   * ones can wrongly conclude the draft "already matches" the refetched
   * baseline and clear the touched ref, letting the very next passive sync
   * overwrite the admin's in-progress edit with the stale refetched value.
   *
   * Kept in sync in TWO ways, deliberately: the change handlers below write
   * `.current` synchronously in the same tick as `setDestination`/
   * `setPublicKey`, and the effects further down mirror the same state as a
   * backstop for any OTHER path that changes this state (e.g. a fresh-record
   * adoption resetting the field). The synchronous write is the one that
   * actually matters here — a passive `useEffect` only runs after React
   * commits the render, which leaves a window, within the same tick, where a
   * pending `refetchConnection()` promise can resolve and read a still-stale
   * ref: the admin's keystroke handler has already fired (and `setState`
   * has been called) but the effect hasn't flushed yet. That is the exact
   * one-tick-later version of the bug this ref was added to fix in the
   * first place.
   */
  const destinationRef = useRef(destination);
  const publicKeyRef = useRef(publicKey);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);
  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);
  /** Same "current dirtiness" role as the refs above, but for the secret key
   *  draft — tracked via a ref instead of reading `secretKey` state directly
   *  inside the sync effect below, so that effect stays free of a dependency
   *  that would otherwise fire it on every keystroke. There's no baseline to
   *  compare against (the server never sends back a real secret), so any
   *  non-empty draft counts as dirty. */
  const secretKeyDraftRef = useRef(false);
  /**
   * The highest `configVersion` this component has adopted for the current
   * tenant. Versions belong to tenant-specific epochs and cannot be ordered
   * across different effective tenants.
   */
  const latestVersionRef = useRef<VersionedTenant | null>(null);

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

  /**
   * Whether `candidate` is older than the highest version this component
   * has already adopted — i.e. it must be discarded outright rather than
   * partially applied. A background query that started before a successful
   * save or conflict rebase can still resolve afterward with the pre-save
   * content: `useGetLangfuseConnectionQuery` never cancels an in-flight
   * fetch on mutation success, so without this guard that stale response
   * would pass through the effect below and silently revert
   * destination/publicKey (for whichever fields the admin hasn't touched)
   * back to the pre-save values, while `expectedVersion` stays correctly
   * frozen at the new version if a secret-key draft is in progress — the
   * next Save would then pass CAS on that new version while resubmitting
   * the reverted, stale destination/publicKey.
   *
   * Within one tenant, a numeric latest version always outranks a `null`
   * candidate version. A different tenant starts a separate version epoch and
   * must be adopted even when its version is lower or absent.
   */
  const isStale = (candidate: TLangfuseConnectionStatus): boolean => {
    const latest = latestVersionRef.current;
    return (
      latest != null &&
      (candidate.effectiveTenantId ?? '') === latest.effectiveTenantId &&
      latest.configVersion != null &&
      (candidate.configVersion == null || candidate.configVersion < latest.configVersion)
    );
  };

  const rememberVersion = (candidate: TLangfuseConnectionStatus) => {
    latestVersionRef.current = {
      configVersion: candidate.configVersion ?? null,
      effectiveTenantId: candidate.effectiveTenantId ?? '',
    };
  };

  useEffect(() => {
    if (!status || isStale(status)) {
      return;
    }
    rememberVersion(status);
    setConnectionStatus(status);
  }, [status]);

  /**
   * Handles *passive* syncs only — `connectionStatus` changing because
   * `status` (the query's own data) changed, e.g. a reconnect-triggered
   * background refetch, not because this component explicitly adopted a
   * fresh record. Explicit actions (save success, conflict rebase) call
   * `applyFreshRecord` directly instead of relying on this effect, precisely
   * because they can't depend on it firing: React bails out of an identical
   * state update (`Object.is`), and React Query's structural sharing can
   * return the very same object reference `connectionStatus` already holds
   * when a refetch's result is unchanged — silently skipping this effect and
   * leaving `expectedVersion` stuck at whatever it was.
   *
   * For a passive sync specifically, that same bail-out is harmless: if the
   * object didn't change, there's nothing to react to. What must not happen
   * is advancing `expectedVersion` here while a draft survives — that would
   * let a later Save pass CAS on a version never actually paired with this
   * draft's content.
   */
  useEffect(() => {
    if (!connectionStatus) {
      return;
    }
    const effectiveTenantId = connectionStatus.effectiveTenantId ?? '';
    const tenantChanged = effectiveTenantId !== writeBaseline.expectedTenantId;
    if (tenantChanged) {
      destinationTouchedRef.current = false;
      publicKeyTouchedRef.current = false;
      secretKeyDraftRef.current = false;
      autoTestedConnectionRef.current = undefined;
      connectionTestRequestRef.current += 1;
      setSecretKey('');
      setIsEditingPublicKey(false);
      setIsEditingSecretKey(false);
    }
    if (tenantChanged || !destinationTouchedRef.current) {
      setDestination(connectionStatus.destination ?? '');
    } else if (destination === (connectionStatus.destination ?? '')) {
      destinationTouchedRef.current = false;
    }
    if (tenantChanged || !publicKeyTouchedRef.current) {
      setPublicKey(connectionStatus.publicKey ?? '');
    } else if (publicKey.trim() === (connectionStatus.publicKey ?? '')) {
      publicKeyTouchedRef.current = false;
    }
    const hasLocalDraft =
      destinationTouchedRef.current || publicKeyTouchedRef.current || secretKeyDraftRef.current;
    if (tenantChanged || !hasLocalDraft) {
      setWriteBaseline({
        expectedVersion: connectionStatus.configVersion ?? null,
        expectedTenantId: effectiveTenantId,
      });
    }
    // destination/publicKey are read only for the reconvergence check above,
    // which must run when `connectionStatus` changes, not on every keystroke —
    // adding them here would fire this effect on every edit instead of only
    // on a genuine sync, same reasoning as secretKeyDraftRef's docstring above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  /**
   * The one place an *explicit* action (save success, conflict rebase)
   * adopts a fresh record. Sets `expectedVersion` directly and synchronously
   * instead of going through `setConnectionStatus` + the effect above, since
   * that effect isn't guaranteed to fire (see its docstring) and this call
   * site's whole point is to always pair the fresh version with whatever
   * same-tenant draft remains. A tenant change discards the old tenant's
   * draft before adopting the new record. Guarded by the same `isStale` check
   * as the passive sync effect above: an explicit action's own read can itself
   * be superseded by a different action that already landed a higher version
   * while this one was in flight (e.g. two rapid Save clicks), and adopting
   * the loser here would be exactly the same regression, just triggered by a
   * different path.
   */
  const applyFreshRecord = (fresh: TLangfuseConnectionStatus) => {
    if (isStale(fresh)) {
      return;
    }
    const effectiveTenantId = fresh.effectiveTenantId ?? '';
    const tenantChanged = effectiveTenantId !== writeBaseline.expectedTenantId;
    rememberVersion(fresh);
    if (tenantChanged) {
      destinationTouchedRef.current = false;
      publicKeyTouchedRef.current = false;
      secretKeyDraftRef.current = false;
      autoTestedConnectionRef.current = undefined;
      connectionTestRequestRef.current += 1;
      setSecretKey('');
      setIsEditingPublicKey(false);
      setIsEditingSecretKey(false);
    }
    if (tenantChanged || !destinationTouchedRef.current) {
      setDestination(fresh.destination ?? '');
    } else if (destinationRef.current === (fresh.destination ?? '')) {
      // The surviving draft happens to already match the fresh baseline
      // (e.g. a rebase reveals another admin's change that coincides with
      // this one) — recompute rather than leave it stuck "touched", or
      // passive syncs would keep freezing expectedVersion for a divergence
      // that no longer exists, causing unnecessary 409s. Reads the ref, not
      // the closed-over `destination` — see the ref's doc comment.
      destinationTouchedRef.current = false;
    }
    if (tenantChanged || !publicKeyTouchedRef.current) {
      setPublicKey(fresh.publicKey ?? '');
    } else if (publicKeyRef.current.trim() === (fresh.publicKey ?? '')) {
      publicKeyTouchedRef.current = false;
    }
    setWriteBaseline({
      expectedVersion: fresh.configVersion ?? null,
      expectedTenantId: effectiveTenantId,
    });
    setConnectionStatus(fresh);
  };

  const secretConfigured = connectionStatus?.configured === true;
  const configActive = connectionStatus?.configActive !== false;
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
    configActive &&
    destination !== '' &&
    trimmedPublicKey !== '' &&
    ((!connectionCredentialsChanged && secretConfigured) || trimmedSecretKey !== '');
  const busy = testMutation.isLoading || updateMutation.isLoading;

  useEffect(() => {
    const storedConnectionTestKey = getStoredConnectionTestKey(connectionStatus);
    if (!connectionStatus) {
      return;
    }
    if (!configActive) {
      autoTestedConnectionRef.current = undefined;
      connectionTestRequestRef.current += 1;
      setConnectionTestState('inactive');
      setConnectionTestMessage('');
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
  }, [configActive, connectionStatus, localize, testMutation]);

  const connectionStatusLabel =
    connectionTestState === 'failed' && connectionTestMessage !== ''
      ? connectionTestMessage
      : localize(getConnectionStatusLabelKey(connectionTestState));
  const connectionStatusDotClass = getConnectionStatusDotClass(connectionTestState);
  const connectionStatusTextClass =
    connectionTestState === 'failed' ? 'text-text-destructive' : 'text-text-secondary';
  const connectionStatusTitle =
    connectionTestState === 'failed' ? localize('com_ui_langfuse_status_failed_hover') : undefined;

  /**
   * A 409 means another admin's write landed since this form's baseline was
   * read. Resending the local draft under the server's bumped version would
   * silently reapply this form's stale `destination`/`publicKey` (and
   * `enabled`, for the toggle path) over that concurrent change. Refetching
   * and re-basing via `applyFreshRecord` avoids that — fields the admin
   * hasn't touched pick up the latest server value, `expectedVersion` comes
   * from that same read, not the error body, and it's set directly rather
   * than left to the passive sync effect. Same-tenant drafts survive; a tenant
   * change clears the previous tenant's draft before adopting the new record.
   *
   * A failed or stale refetch must not advance `expectedVersion` on its own:
   * React Query resolves a failed refetch with `isError: true` while still
   * holding the previous `data`, so `result.data` alone doesn't prove the
   * read is fresh. Leaving the token at its pre-conflict (now known-stale)
   * value means the next Save attempt safely 409s again instead of risking a
   * pass built on fields that were never actually refreshed.
   */
  const rebaseOnConflict = (error: unknown) => {
    showToast({
      message: localize(
        isTenantConflict(error)
          ? 'com_ui_langfuse_tenant_changed'
          : 'com_ui_langfuse_version_conflict',
      ),
      status: 'warning',
    });
    setConnectionTestState('unverified');
    setConnectionTestMessage('');
    refetchConnection().then((result) => {
      if (result.isError || !result.data) {
        setConnectionTestState('failed');
        setConnectionTestMessage(localize('com_ui_langfuse_conflict_refresh_error'));
        return;
      }
      applyFreshRecord(result.data);
    });
  };

  const handleSave = () => {
    if (!configActive) {
      return;
    }
    const payload = {
      enabled: !secretConfigured || connectionStatus?.enabled === true,
      destination,
      publicKey: trimmedPublicKey,
      ...(trimmedSecretKey ? { secretKey: trimmedSecretKey } : {}),
      ...writeBaseline,
    };

    connectionTestRequestRef.current += 1;
    updateMutation.mutate(payload, {
      onSuccess: (nextStatus) => {
        autoTestedConnectionRef.current =
          nextStatus.configActive === false ? undefined : getStoredConnectionTestKey(nextStatus);
        destinationTouchedRef.current = false;
        publicKeyTouchedRef.current = false;
        secretKeyDraftRef.current = false;
        applyFreshRecord(nextStatus);
        setConnectionTestState(nextStatus.configActive === false ? 'inactive' : 'connected');
        setConnectionTestMessage('');
        setSecretKey('');
        setIsEditingPublicKey(false);
        setIsEditingSecretKey(false);
        showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
      },
      onError: (error) => {
        if (isVersionConflict(error)) {
          rebaseOnConflict(error);
          return;
        }
        setConnectionTestState('failed');
        setConnectionTestMessage(localize('com_ui_langfuse_save_error'));
        showToast({ message: localize('com_ui_langfuse_save_error'), status: 'error' });
      },
    });
  };

  const handleDestinationChange = (nextDestination: string) => {
    destinationTouchedRef.current = nextDestination !== (connectionStatus?.destination ?? '');
    destinationRef.current = nextDestination;
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
    if (
      !configActive ||
      !secretConfigured ||
      !connectionStatus?.destination ||
      !connectionStatus.publicKey
    ) {
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
          ...writeBaseline,
        },
        {
          onSuccess: (nextStatus) => {
            if (requestId !== connectionTestRequestRef.current) {
              return;
            }
            autoTestedConnectionRef.current = getStoredConnectionTestKey(nextStatus);
            applyFreshRecord(nextStatus);
            showToast({ message: localize('com_ui_langfuse_saved'), status: 'success' });
          },
          onError: (error) => {
            if (requestId !== connectionTestRequestRef.current) {
              return;
            }
            if (isVersionConflict(error)) {
              rebaseOnConflict(error);
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
      <Popover>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="font-medium">{localize('com_ui_langfuse_title')}</div>
            <div className="rounded-full border border-brand-purple/40 bg-brand-purple/10 px-2 py-0.5 text-xs font-medium text-brand-purple">
              {localize('com_ui_beta')}
            </div>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={localize('com_ui_more_info')}
                className="inline-flex size-6 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
              >
                <CircleHelpIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </div>
          <div
            data-testid="langfuse-connection-status"
            className={`ml-auto flex max-w-full shrink-0 items-start justify-end gap-1.5 text-right text-xs sm:max-w-[50%] ${connectionStatusTextClass}`}
            aria-live="polite"
            title={connectionStatusTitle}
          >
            {connectionTestState === 'checking' ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${connectionStatusDotClass}`} />
            )}
            <span>{connectionStatusLabel}</span>
          </div>
        </div>

        <PopoverPortal>
          <PopoverContent
            side="top"
            sideOffset={6}
            className="z-[999] w-80 rounded-xl border border-border-light bg-surface-secondary p-4 text-text-primary shadow-md outline-none"
          >
            <p className="text-sm text-text-secondary">{localize('com_ui_langfuse_beta_info')}</p>
          </PopoverContent>
        </PopoverPortal>
      </Popover>

      {!configActive && (
        <div
          role="status"
          className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-secondary"
        >
          {localize('com_ui_langfuse_config_inactive')}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label id="langfuse-destination-label">{localize('com_ui_langfuse_destination')}</Label>
        <Dropdown
          value={destination}
          label={destination === '' ? localize('com_ui_select') : ''}
          onChange={handleDestinationChange}
          options={destinationOptions}
          disabled={!configActive || destinations.length === 0 || busy}
          className="w-full"
          triggerClassName="w-full"
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
            disabled={!configActive || busy}
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
            disabled={!configActive || busy}
            placeholder="pk-lf-..."
            onChange={(e) => {
              connectionTestRequestRef.current += 1;
              const nextPublicKey = e.target.value;
              publicKeyTouchedRef.current =
                nextPublicKey.trim() !== (connectionStatus?.publicKey ?? '');
              publicKeyRef.current = nextPublicKey;
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
            disabled={!configActive || busy}
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
            disabled={!configActive || busy}
            placeholder="sk-lf-..."
            onChange={(e) => {
              connectionTestRequestRef.current += 1;
              const nextSecretKey = e.target.value;
              secretKeyDraftRef.current = nextSecretKey.trim() !== '';
              setSecretKey(nextSecretKey);
              setConnectionTestState('unverified');
              setConnectionTestMessage('');
            }}
          />
        )}
      </div>

      <div className="flex min-h-9 items-center justify-end gap-2">
        {isEditing ? (
          <Button variant="submit" disabled={!canSubmit || busy} onClick={handleSave}>
            {testMutation.isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                {localize('com_ui_langfuse_testing')}
              </span>
            ) : (
              localize('com_ui_save')
            )}
          </Button>
        ) : (
          <Button
            variant={connectionStatus?.enabled === true ? 'outline' : 'submit'}
            disabled={
              !configActive ||
              busy ||
              (connectionStatus?.enabled !== true && !connectionDestinationAvailable)
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
