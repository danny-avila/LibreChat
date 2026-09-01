import { createStorageAtom } from '~/store/jotai-utils';

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
