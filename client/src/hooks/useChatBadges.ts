import { useRecoilCallback } from 'recoil';
import { useRecoilValue } from 'recoil';
import { MessageCircleDashed, Box } from 'lucide-react';
import type { BadgeItem } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface ChatBadgeConfig {
  id: string;
  icon: typeof Box;
  label: string;
  atom?: any;
}

const badgeConfig: ReadonlyArray<ChatBadgeConfig> = [
  // {
  //   id: '1',
  //   icon: Box,
  //   label: 'com_ui_artifacts',
  //   atom: store.codeArtifacts,
  // },
  // TODO: add more badges here (missing store atoms)
];

export default function useChatBadges(): BadgeItem[] {
  const localize = useLocalize();
  const activeBadges = useRecoilValue(store.chatBadges) as Array<{ id: string }>;
  const activeBadgeIds = new Set(activeBadges.map((badge) => badge.id));

  return badgeConfig.map((cfg) => ({
    id: cfg.id,
    label: localize(cfg.label),
    icon: cfg.icon,
    atom: cfg.atom,
    isAvailable: activeBadgeIds.has(cfg.id),
  }));
}

export function useResetChatBadges() {
  return useRecoilCallback(
    ({ reset }) =>
      () => {
        badgeConfig.forEach(({ atom }) => reset(atom));
        reset(store.chatBadges);
      },
    [],
  );
}
