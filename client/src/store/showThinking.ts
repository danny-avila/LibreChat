import { createStorageAtom } from './jotai-utils';

const DEFAULT_SHOW_THINKING = false;

/**
 * This atom controls whether AI reasoning/thinking content is expanded by default.
 */
export const showThinkingAtom = createStorageAtom<boolean>('showThinking', DEFAULT_SHOW_THINKING);
