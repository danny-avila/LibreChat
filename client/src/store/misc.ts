import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { TAttachment } from 'librechat-data-provider';
import { BadgeItem } from '~/common';

const hideBannerHint = atomWithStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({});

const queriesEnabled = atom<boolean>(true);

const isEditingBadges = atom<boolean>(false);

const chatBadges = atomWithStorage<Pick<BadgeItem, 'id'>[]>('chatBadges', [
  // When adding new badges, make sure to add them to useChatBadges.ts as well and add them as last item
  // DO NOT CHANGE THE ORDER OF THE BADGES ALREADY IN THE ARRAY
  { id: '1' },
  // { id: '2' },
]);

export default {
  hideBannerHint,
  messageAttachmentsMap,
  queriesEnabled,
  isEditingBadges,
  chatBadges,
};
