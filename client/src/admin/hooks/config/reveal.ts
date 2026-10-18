import { useEffect } from 'react';
import type * as t from '~/admin/types';
import { isPathInSection } from '~/admin/components/configuration/configMeta';
import { revealConfigPath } from '~/admin/components/configuration/reveal';

/** The tab section that renders `path`, so its accordion can be opened first. */
export function sectionIdForPath(
  sections: t.ConfigSectionConfig[],
  path: string,
): string | undefined {
  return sections.find((section) =>
    isPathInSection(section.id, section.schemaKey ?? section.id, path),
  )?.id;
}

/**
 * Reveals the `?field=` deep link once the tab has rendered: expands its
 * ancestors and entry card, scrolls to it, highlights and focuses it, then
 * calls `onDone` (which drops `field` from the URL) (WS5: SH-3).
 */
export function useRevealField({
  container,
  field,
  sections,
  ready,
  onDone,
}: t.RevealFieldOptions): void {
  const sectionId = field ? sectionIdForPath(sections, field) : undefined;
  useEffect(() => {
    if (!container || !field || !ready) return;
    return revealConfigPath(container, { path: field, sectionId }, { onDone });
  }, [container, field, sectionId, ready, onDone]);
}
