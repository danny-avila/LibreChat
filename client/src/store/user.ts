import { atom } from 'recoil';
import type { TUser, TPlugin } from 'librechat-data-provider';
import { setSessionUserId } from '~/utils/session';

const user = atom<TUser | undefined>({
  key: 'user',
  default: undefined,
  /* Publishes the signed-in account for work that outlives the component which
   * started it. An atom effect runs wherever the atom is set, including sign-out,
   * so the identity does not depend on any screen still being mounted: the
   * sidebar drops sections as the user searches, and an identity that vanished
   * with them would either strand their queued writes or, if retained, go stale
   * across a sign-in and let those writes reach the next account. */
  effects: [
    ({ onSet }) => {
      onSet((next) => setSessionUserId(next?.id));
    },
  ],
});

const availableTools = atom<Record<string, TPlugin>>({
  key: 'availableTools',
  default: {},
});

export default {
  user,
  availableTools,
};
