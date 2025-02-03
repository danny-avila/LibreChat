import { atom } from 'recoil';
import { TAttachment } from 'librechat-data-provider';
import { atomWithLocalStorage } from './utils';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({
  key: 'messageAttachmentsMap',
  default: {},
});

const queriesEnabled = atom<boolean>({
  key: 'queriesEnabled',
  default: true,
});

export default { hideBannerHint, messageAttachmentsMap, queriesEnabled };
