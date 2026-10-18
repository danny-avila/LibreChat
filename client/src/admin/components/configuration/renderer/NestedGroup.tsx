import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CountBadge, DecorativeIcon } from '~/admin/components/shared';
import { useCollapsibleSection } from '../useCollapsibleSection';
import { SettingsSection } from '../SettingsSection';
import { useLocalize } from '~/admin/hooks';

export function NestedGroup({
  label,
  sectionId,
  configuredCount = 0,
  totalCount = 0,
  onAdd,
  addLabel,
  disabled,
  defaultExpanded,
  entries,
  revealPaths,
  children,
}: {
  label: string;
  sectionId?: string;
  configuredCount?: number;
  totalCount?: number;
  /** Nesting is shown by the group rule and heading indent (styles.css); kept for callers. */
  depth?: number;
  /** When provided, renders a "+ Add" button inline in the header. */
  onAdd?: () => void;
  addLabel?: string;
  /** Start expanded regardless of the configured count (e.g. a required object in a new entry). */
  defaultExpanded?: boolean;
  /** A collection: the badge shows `totalCount` as its number of entries. */
  entries?: boolean;
  /** Data paths the group shows: it opens while the tab filter matches one of them or inside them. */
  revealPaths?: readonly string[];
  /**
   * When true, the caret/collapse affordance is dropped and the group renders
   * flat with a static heading. Used in fully read-only sections where the
   * expand/collapse interaction would be misleading.
   */
  disabled?: boolean;
  children: ReactNode;
}) {
  const localize = useLocalize();
  const hasConfigured = configuredCount > 0;
  const { isExpanded, hasEverExpanded, sectionRef, toggle, handleAddClick } = useCollapsibleSection(
    { defaultExpanded: defaultExpanded ?? hasConfigured, onAdd, revealPaths },
  );
  const autoExpandedRef = useRef(hasConfigured);

  useEffect(() => {
    if (!hasConfigured || autoExpandedRef.current) return;
    autoExpandedRef.current = true;
    sectionRef.current?.dispatchEvent(new Event('config:expand'));
  }, [hasConfigured, sectionRef]);

  const addButton =
    onAdd && !disabled ? (
      <button type="button" onClick={handleAddClick} className="config-add-btn">
        <DecorativeIcon name="plus" size="sm" />
        <span>
          {addLabel ?? localize('com_admin_ui_add_item', { item: localize('com_admin_ui_entry') })}
        </span>
      </button>
    ) : undefined;

  return (
    <SettingsSection
      id={sectionId}
      sectionRef={sectionRef}
      title={label}
      variant="group"
      badge={<CountBadge configured={configuredCount} total={totalCount} entries={entries} />}
      actions={addButton}
      collapsible={!disabled}
      expanded={isExpanded}
      onToggle={toggle}
      hasEverExpanded={hasEverExpanded}
    >
      {children}
    </SettingsSection>
  );
}
