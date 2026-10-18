import { useContext, useId } from 'react';
import type * as t from '~/admin/types';
import { HeadingLevelContext, SoleFieldContext } from '~/admin/contexts/SettingsContext';
import { DecorativeIcon } from '~/admin/components/shared';
import { renderCollapsible } from './renderCollapsible';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4', 5: 'h5', 6: 'h6' } as const;

function nextLevel(level: t.SettingsHeadingLevel): t.SettingsHeadingLevel {
  return level < 6 ? ((level + 1) as t.SettingsHeadingLevel) : 6;
}

/**
 * The one settings container (VS-2/VS-5): a bordered card with an h2 for
 * top-level sections, or a nested group with an h3/h4 and a left rule. The
 * heading wraps the expand button (WAI-ARIA accordion pattern); the body
 * keeps the row grid's columns, so nesting never shifts controls.
 */
export function SettingsSection({
  id,
  title,
  description,
  learnMoreUrl,
  variant = 'card',
  level,
  badge,
  actions,
  collapsible = true,
  expanded = true,
  onToggle,
  hasEverExpanded = false,
  sticky = false,
  sectionRef,
  children,
}: t.SettingsSectionProps) {
  const localize = useLocalize();
  const contextLevel = useContext(HeadingLevelContext);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;
  const isCard = variant === 'card';
  const groupLevel = Math.max(contextLevel, 3) as t.SettingsHeadingLevel;
  const headingLevel = level ?? (isCard ? contextLevel : groupLevel);
  const Heading = HEADING_TAGS[headingLevel];
  const isOpen = !collapsible || expanded;

  const chevron = (
    <span className="settings-chevron">
      <DecorativeIcon name="chevron-right" size={isCard ? 'sm' : 'xs'} />
    </span>
  );

  const titleText = (
    <span id={titleId} className={isCard ? 'settings-section-title' : 'settings-group-title'}>
      {title}
    </span>
  );

  const heading = (
    <Heading className="settings-heading">
      {collapsible ? (
        <button
          type="button"
          className={cn('settings-trigger', isCard && 'settings-section-trigger')}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          {!isCard && chevron}
          {titleText}
          {badge}
          {isCard && chevron}
        </button>
      ) : (
        <span className="flex items-center gap-2">
          {titleText}
          {badge}
        </span>
      )}
    </Heading>
  );

  const descriptionNode = description ? (
    <p className={isCard ? 'settings-help' : 'settings-group-desc'}>
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
  ) : null;

  const bodyClass = isCard ? 'settings-section-body' : 'settings-group-body';
  const body = (
    <HeadingLevelContext.Provider value={nextLevel(headingLevel)}>
      <SoleFieldContext.Provider value={null}>{children}</SoleFieldContext.Provider>
    </HeadingLevelContext.Provider>
  );

  return (
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={titleId}
      className={isCard ? 'settings-section' : 'settings-group'}
      data-settings-section={isCard ? '' : undefined}
    >
      <div
        data-section-id={id}
        data-sticky={sticky && isOpen ? 'true' : undefined}
        className={isCard ? 'settings-section-header' : 'settings-group-header'}
      >
        {isCard ? (
          <div className="settings-section-headtext">
            {heading}
            {descriptionNode}
          </div>
        ) : (
          heading
        )}
        {actions && (
          <div className={isCard ? 'settings-section-actions' : 'settings-group-actions'}>
            {actions}
          </div>
        )}
      </div>
      {!isCard && descriptionNode}
      {collapsible ? (
        renderCollapsible(expanded, hasEverExpanded, body, bodyClass, bodyId)
      ) : (
        <div id={bodyId} className={bodyClass}>
          {body}
        </div>
      )}
    </section>
  );
}
