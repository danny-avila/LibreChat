import { useMemo, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import store from '~/store';

export type ComposerItemKind = 'quote' | 'skill';

/**
 * One piece of context staged for the next submission.
 *
 * Files are deliberately not here: they carry upload progress, previews and
 * their own delete-or-abort semantics, and `FileRow` already renders them as
 * cards. This covers the sources whose whole content is a line of text.
 */
export interface ComposerItem {
  id: string;
  kind: ComposerItemKind;
  label: string;
  /** Full text for the tooltip when `label` is truncated in the chip. */
  title: string;
  remove: () => void;
}

/**
 * Merges the staged-text sources into a single ordered list in one pass each,
 * so the tray renders one homogeneous list instead of a row per source.
 */
export default function useComposerItems(conversationId: string): ComposerItem[] {
  const quotes = useRecoilValue(store.pendingQuotesByConvoId(conversationId));
  const skills = useRecoilValue(store.pendingManualSkillsByConvoId(conversationId));
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));
  const setSkills = useSetRecoilState(store.pendingManualSkillsByConvoId(conversationId));

  const removeQuoteAt = useCallback(
    (index: number) => setQuotes((prev) => prev.filter((_, i) => i !== index)),
    [setQuotes],
  );
  const removeSkill = useCallback(
    (name: string) => setSkills((prev) => prev.filter((skill) => skill !== name)),
    [setSkills],
  );

  return useMemo(() => {
    const items: ComposerItem[] = [];

    for (let i = 0; i < quotes.length; i++) {
      const text = quotes[i];
      items.push({
        id: `quote:${i}:${text.slice(0, 24)}`,
        kind: 'quote',
        label: text,
        title: text,
        remove: () => removeQuoteAt(i),
      });
    }

    for (const name of skills) {
      items.push({
        id: `skill:${name}`,
        kind: 'skill',
        label: name,
        title: name,
        remove: () => removeSkill(name),
      });
    }

    return items;
  }, [quotes, skills, removeQuoteAt, removeSkill]);
}
