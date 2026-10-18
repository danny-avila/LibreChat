import { useState, useContext, useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type * as t from '~/admin/types';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { SoleFieldContext } from '~/admin/contexts/SettingsContext';
import { useLocalize, useExpandSignal } from '~/admin/hooks';
import { CountBadge } from '~/admin/components/shared';
import { SettingsSection } from './SettingsSection';

/**
 * A single-field section (VS-2): one card whose header row is the field row.
 * The section title and description fill the label column, so the field's own
 * label is not repeated; `SettingsRow` names the control "<Section> <field>".
 */
function SoleFieldSection({
  domId,
  title,
  description,
  learnMoreUrl,
  children,
}: t.SoleFieldSectionProps) {
  const localize = useLocalize();
  const headingId = `${useId()}-heading`;
  const context = useMemo(() => ({ headingId, sectionTitle: title }), [headingId, title]);

  return (
    <section
      id={domId}
      aria-labelledby={headingId}
      className="settings-section settings-section-sole"
      data-settings-section=""
    >
      <div className="settings-row">
        <div className="settings-row-label" data-section-id={domId}>
          <h2 id={headingId} className="settings-heading settings-section-title">
            {title}
          </h2>
          {description && (
            <p className="settings-help">
              {description}
              {learnMoreUrl && (
                <>
                  {' '}
                  <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer">
                    {localize('com_admin_ui_read_more')}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <SoleFieldContext.Provider value={context}>{children}</SoleFieldContext.Provider>
      </div>
    </section>
  );
}

/** A top-level configuration section: an h2 card that collapses, or a single-field card. */
export function ConfigSection({
  sectionId,
  title,
  description,
  learnMoreUrl,
  children,
  hidden,
  configuredCount = 0,
  totalCount = 0,
  countsEntries,
  overrideCount,
  defaultExpanded,
  inline,
  showConfiguredOnly,
}: t.ConfigSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded ?? configuredCount > 0);
  const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded);
  const sectionRef = useRef<HTMLElement>(null);
  const userToggledRef = useRef(false);

  useEffect(() => {
    if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);
  }, [isExpanded, hasEverExpanded]);

  useEffect(() => {
    if (defaultExpanded === undefined && configuredCount > 0 && !userToggledRef.current) {
      setIsExpanded(true);
    }
  }, [defaultExpanded, configuredCount]);

  /* Turning "configured only" on opens a section with settings; collapsing it afterwards
     sticks, so only the toggle itself triggers this. */
  const openState = useRef({ configuredCount, isExpanded });
  openState.current = { configuredCount, isExpanded };
  useEffect(() => {
    const { configuredCount: count, isExpanded: open } = openState.current;
    if (showConfiguredOnly && count > 0 && !open) setIsExpanded(true);
  }, [showConfiguredOnly]);

  /** While the tab filter is active only sections holding a match render, and they open. */
  const rowFilter = useContext(RowFilterContext);
  useEffect(() => {
    if (rowFilter) setIsExpanded(true);
  }, [rowFilter]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  }, []);

  /** Expand all / Collapse all (WS5 `ExpandProvider`). */
  const applyExpandSignal = useCallback((expanded: boolean) => {
    if (!expanded) userToggledRef.current = true;
    setIsExpanded(expanded);
  }, []);
  useExpandSignal(applyExpandSignal);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const expand = () => setIsExpanded(true);
    const collapse = () => {
      userToggledRef.current = true;
      setIsExpanded(false);
    };
    el.addEventListener('config:expand', expand);
    el.addEventListener('config:collapse', collapse);
    return () => {
      el.removeEventListener('config:expand', expand);
      el.removeEventListener('config:collapse', collapse);
    };
  }, [inline, hidden]);

  if (hidden) return null;

  const domId = sectionId ? `section-${sectionId}` : undefined;

  if (inline) {
    return (
      <SoleFieldSection
        domId={domId}
        title={title}
        description={description}
        learnMoreUrl={learnMoreUrl}
      >
        {children}
      </SoleFieldSection>
    );
  }

  return (
    <SettingsSection
      id={domId}
      sectionRef={sectionRef}
      title={title}
      description={description}
      learnMoreUrl={learnMoreUrl}
      level={2}
      badge={
        <CountBadge
          configured={configuredCount}
          total={totalCount}
          entries={countsEntries}
          overrides={overrideCount}
        />
      }
      expanded={isExpanded}
      onToggle={toggle}
      hasEverExpanded={hasEverExpanded}
      sticky
    >
      {children}
    </SettingsSection>
  );
}
