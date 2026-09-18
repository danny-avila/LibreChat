import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { getConfigDefaults, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { ComposerProps } from '@librechat/client';
import type { MediaHost } from '~/components/Media/host';
import useComposerBindings from '~/hooks/Input/useComposerBindings';
import { resolveComposerKeyDown } from '~/utils/shortcuts';
import { useAuthContext, useHasAccess } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { mediaSessionScope } from './mediaHandoff';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

/** Shell preferences and identity cross the feature boundary through this host adapter. */
export function useMediaShellHost(actions: Pick<MediaHost, 'openThread' | 'useInChat'>) {
  const { user, isAuthenticated, isAuthReady } = useAuthContext();
  const startupQuery = useGetStartupConfig();
  const startup = startupQuery.data;
  const canUse = useHasAccess({
    permissionType: PermissionTypes.MEDIA,
    permission: Permissions.USE,
  });
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.MEDIA,
    permission: Permissions.CREATE,
  });
  const canTemporary = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });
  const canCompare = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const presets = (startup?.interface?.presets ?? defaultInterface.presets) !== false;
  const enterToSend = useRecoilValue(store.enterToSend);
  const { shortcutsEnabled, submitOverride, yieldedChords } = useComposerBindings();
  const scope = user ? mediaSessionScope(user) : undefined;
  const session = useRef({ active: true, scope, isAuthenticated });
  session.current.scope = scope;
  session.current.isAuthenticated = isAuthenticated;
  useEffect(() => {
    const current = session.current;
    current.active = true;
    return () => {
      current.active = false;
    };
  }, []);
  const userId = user?.id;
  const isCurrentSession = useCallback(
    () =>
      session.current.active && session.current.isAuthenticated && session.current.scope === scope,
    [scope],
  );
  const resolveKeyVerdict = useCallback<NonNullable<ComposerProps['resolveKeyVerdict']>>(
    (event, isComposing) => {
      const action = resolveComposerKeyDown(event, {
        isComposing,
        isSubmitting: false,
        allowSubmitWhileGenerating: false,
        hasDuringRunModifier: false,
        shortcutsEnabled,
        enterToSend,
        submitOverride,
        yieldedChords,
      });
      return action === 'submit' || action === 'newline' || action === 'block' ? action : 'none';
    },
    [shortcutsEnabled, enterToSend, submitOverride, yieldedChords],
  );
  const media = startup?.media;
  const host = useMemo<MediaHost | undefined>(
    () =>
      media && scope && isAuthenticated && canUse
        ? {
            scope,
            canCreate: canCreate && media.canCreate,
            pollIntervalMs: media.clientPollIntervalMs,
            catchUpIntervalMs: media.clientCatchUpIntervalMs,
            enterToSend,
            resolveKeyVerdict,
            isCurrentSession,
            features: { presets, temporary: canTemporary, compare: canCompare },
            ...actions,
          }
        : undefined,
    [
      media,
      scope,
      isAuthenticated,
      canUse,
      canCreate,
      canTemporary,
      canCompare,
      presets,
      enterToSend,
      resolveKeyVerdict,
      isCurrentSession,
      actions,
    ],
  );
  return {
    host,
    media,
    canUse,
    userId,
    loading: !isAuthReady || startupQuery.isLoading,
    failed: startupQuery.isError,
    reload: startupQuery.refetch,
  };
}
