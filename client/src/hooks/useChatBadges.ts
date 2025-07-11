import { useMemo, useCallback } from 'react';
import { useAtomValue, useStore } from 'jotai';
import { useResetAtom } from 'jotai/utils';
import { Box } from 'lucide-react';
import type { BadgeItem } from '~/common';
import { useLocalize, TranslationKeys } from '~/hooks';
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
  const activeBadges = useAtomValue(store.chatBadges) as Array<{ id: string }>;
  const activeBadgeIds = useMemo(
    () => new Set(activeBadges.map((badge) => badge.id)),
    [activeBadges],
  );
  const allBadges = useMemo(() => {
    return (
      badgeConfig.map((cfg) => ({
        id: cfg.id,
        label: localize(cfg.label as TranslationKeys),
        icon: cfg.icon,
        atom: cfg.atom,
        isAvailable: activeBadgeIds.has(cfg.id),
      })) || []
    );
  }, [activeBadgeIds, localize]);
  return allBadges;
}

export function useResetChatBadges() {
  const jotaiStore = useStore();
  const resetChatBadges = useResetAtom(store.chatBadges);

  return useCallback(() => {
    badgeConfig.forEach(({ atom }) => {
      if (atom && atom.init !== undefined) {
        jotaiStore.set(atom, atom.init);
      }
    });
    resetChatBadges();
  }, [jotaiStore, resetChatBadges]);
}
