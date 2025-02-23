import { useRecoilValue } from 'recoil';
import { MessageCircleDashed, StickyNote } from 'lucide-react';
import type { BadgeItem } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

const badgeConfig = [
  {
    id: '1',
    icon: MessageCircleDashed,
    label: 'com_ui_temporary',
    atom: store.isTemporary,
  },
  { id: '2', icon: StickyNote, label: 'com_ui_artifacts', atom: store.codeArtifacts },
  // TODO: add more badges here (missing store atoms)
] as const;

export default function useChatBadges(): BadgeItem[] {
  const localize = useLocalize();
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
        label: localize(config.label),
        icon: config.icon,
        atom: config.atom,
        isAvailable: true,
      };
    })
    .filter(Boolean) as BadgeItem[];

  const inactiveBadgeItems: BadgeItem[] = badgeConfig
    .filter((cfg) => !activeBadgeIds.includes(cfg.id))
    .map((cfg) => ({
      id: cfg.id,
      label: localize(cfg.label),
      icon: cfg.icon,
      atom: cfg.atom,
      isAvailable: false,
    }));

  return [...activeBadgeItems, ...inactiveBadgeItems];
}
