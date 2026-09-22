import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { TReplyNotificationsConfig } from 'librechat-data-provider';
import { createStorageAtom } from '~/store/jotai-utils';
import { useGetStartupConfig } from '~/data-provider';

/**
 * Reply-notification preferences, owned by the hooks in this directory: the settings toggles
 * write them and `useReplyAlerts`, `useReplyWatcher` and `useUnseenBadge` are their only readers,
 * so they live with the feature rather than in the global store.
 *
 * Per device rather than per account: browser notification permission and audio output are
 * properties of the machine you are sitting at, so wanting a chime on a laptop implies nothing
 * about wanting one on a phone. The seen state they react to does sync.
 */
export const unseenTabBadgeAtom = createStorageAtom<boolean>('unseenTabBadge', true);
export const replyNotificationsAtom = createStorageAtom<boolean>('replyNotifications', false);
export const replyNotificationSoundAtom = createStorageAtom<boolean>(
  'replyNotificationSound',
  false,
);

/**
 * What the deployment allows, independent of what this device prefers.
 *
 * Mirrors `interface.replyNotifications` in `librechat.yaml`. The fallbacks reproduce the
 * shipped behavior for a server that predates the setting or answers without it, so a client
 * held against an older backend behaves as it did before the gate existed.
 */
export const REPLY_NOTIFICATION_DEFAULTS: Required<TReplyNotificationsConfig> = {
  tabBadge: true,
  desktop: true,
  sound: true,
  pollLimit: 100,
};

const isBounded = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;

/**
 * The reply-alert capabilities this deployment permits.
 *
 * Every field is re-checked here rather than trusted from the payload: a cached startup config
 * can outlive the schema that produced it, and an out-of-range poll limit would otherwise reach
 * the list request as a page size the server has to reject.
 */
export function useReplyNotificationCapabilities(): Required<TReplyNotificationsConfig> {
  const { data: startupConfig } = useGetStartupConfig();
  const configured = startupConfig?.interface?.replyNotifications;
  return useMemo(
    () => ({
      tabBadge: configured?.tabBadge !== false,
      desktop: configured?.desktop !== false,
      sound: configured?.sound !== false,
      pollLimit: isBounded(configured?.pollLimit)
        ? configured.pollLimit
        : REPLY_NOTIFICATION_DEFAULTS.pollLimit,
    }),
    [configured?.tabBadge, configured?.desktop, configured?.sound, configured?.pollLimit],
  );
}

/** What this device wants, once the deployment's gate has been applied to it. */
export interface ReplyAlertPreferences {
  badgeEnabled: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  pollLimit: number;
}

/**
 * A capability the operator turned off reads as off here whatever this device stored, so a
 * preference saved before the gate closed cannot keep announcing replies.
 */
export function useReplyAlertPreferences(): ReplyAlertPreferences {
  const capabilities = useReplyNotificationCapabilities();
  const badgePreferred = useAtomValue(unseenTabBadgeAtom);
  const notificationsPreferred = useAtomValue(replyNotificationsAtom);
  const soundPreferred = useAtomValue(replyNotificationSoundAtom);
  return useMemo(
    () => ({
      badgeEnabled: capabilities.tabBadge && badgePreferred,
      notificationsEnabled: capabilities.desktop && notificationsPreferred,
      soundEnabled: capabilities.sound && soundPreferred,
      pollLimit: capabilities.pollLimit,
    }),
    [capabilities, badgePreferred, notificationsPreferred, soundPreferred],
  );
}
