import { createStorageAtom } from '~/store/jotai-utils';

/**
 * Whether this deployment configured footer content of its own, as of the last
 * time `/api/config` answered. Feature-owned and persisted: the chat surface
 * both writes it (when the config resolves) and reads it (while the next load's
 * config is still in flight), and a deployment's footer configuration is a
 * deployment-lifetime fact, so remembering it is what lets the composer lay out
 * once instead of guessing and correcting.
 *
 * `getOnInit` gives the stored value on the first render, which is the whole
 * point — a value that arrived an effect later would be the guess again.
 */
export const configuredFooterAtom = createStorageAtom<boolean>('configured-footer', false);
