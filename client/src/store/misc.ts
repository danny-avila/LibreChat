import { atom } from 'recoil';
import { TAttachment } from 'librechat-data-provider';
import { Search, Lightbulb, Star, MessageCircleDashed } from 'lucide-react';
import { atomWithLocalStorage } from './utils';
import { BadgeItem } from '~/common';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({
  key: 'messageAttachmentsMap',
  default: {},
});

const queriesEnabled = atom<boolean>({
  key: 'queriesEnabled',
  default: true,
});

const isEditingBadges = atom<boolean>({
  key: 'isEditingBadges',
  default: false,
});

const chatBadges = atomWithLocalStorage<BadgeItem[]>('chatBadges', [
  { id: '1', icon: Search, label: 'DeepSearch', isActive: false },
  { id: '2', icon: Lightbulb, label: 'Think', isActive: false },
  { id: '3', icon: Star, label: 'Favorites', isActive: false },
  { id: '4', icon: MessageCircleDashed, label: 'Temporary', isActive: false },
]);

export default {
  hideBannerHint,
  messageAttachmentsMap,
  queriesEnabled,
  isEditingBadges,
  chatBadges,
};
