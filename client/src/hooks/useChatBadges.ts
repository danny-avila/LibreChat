import { useRecoilValue } from 'recoil';
import store from '~/store';
import { MessageCircleDashed, StickyNote } from 'lucide-react';

import type { BadgeItem } from '~/common';

const badgeConfig = [
  { id: '1', icon: MessageCircleDashed, label: 'Temporary', atom: store.isTemporary },
  { id: '2', icon: StickyNote, label: 'Artifact', atom: store.codeArtifacts },
  // TODO: add more badges here (missing store atoms)
];

export default function useChatBadges(): BadgeItem[] {
  const activeBadges = useRecoilValue(store.chatBadges) as Array<{ id: string }>;
  const activeBadgeIds = activeBadges.map((badge) => badge.id);

  const activeBadgeItems: BadgeItem[] = activeBadges
    .map((badge) => {
      const config = badgeConfig.find((cfg) => cfg.id === badge.id);
      if (!config) {
        return null;
      }
      return {
        id: config.id,
        label: config.label,
        icon: config.icon,
        atom: config.atom,
        isActive: true,
      };
    })
    .filter(Boolean) as BadgeItem[];

  const inactiveBadgeItems: BadgeItem[] = badgeConfig
    .filter((cfg) => !activeBadgeIds.includes(cfg.id))
    .map((cfg) => ({
      id: cfg.id,
      label: cfg.label,
      icon: cfg.icon,
      atom: cfg.atom,
      isActive: false,
    }));

  return [...activeBadgeItems, ...inactiveBadgeItems];
}
