import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { ChangeRow } from './ChangeRow';
import { Icon } from '~/admin/ui';

function SectionBlock({
  section,
  showTitle,
  ...rowProps
}: Omit<t.ReviewListProps, 'tabs'> & { section: t.ReviewSection; showTitle: boolean }) {
  const localize = useLocalize();
  return (
    <section aria-label={section.title} className="flex flex-col gap-1">
      {showTitle && (
        <h4 className="m-0 text-sm font-semibold text-(--cui-color-text-default)">
          {section.title}
        </h4>
      )}
      {section.notices.includes('ownershipChange') && (
        <p className="m-0 flex items-start gap-1 text-xs text-(--cui-color-accent-warning)">
          <span aria-hidden="true" className="flex pt-0.5">
            <Icon name="warning" size="xs" />
          </span>
          {localize(
            rowProps.isScope
              ? 'com_admin_config_review_warning_ownership_scope'
              : 'com_admin_config_review_warning_ownership',
          )}
        </p>
      )}
      {section.rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {section.rows.map((row) => (
            <ChangeRow key={row.key} row={row} {...rowProps} />
          ))}
        </ul>
      )}
      {section.entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-0.5">
          <p className="m-0 mt-1 text-xs text-(--cui-color-text-muted)">
            <span className="font-semibold text-(--cui-color-text-default)">{entry.title}</span> ·{' '}
            {entry.noun}
          </p>
          <ul className="m-0 flex list-none flex-col gap-0.5 border-l-2 border-(--cui-color-stroke-default) p-0 pl-2">
            {entry.rows.map((row) => (
              <ChangeRow key={row.key} row={row} {...rowProps} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** A one-setting section whose row already names it ("Image output type"): no heading repeats it. */
function isSoleRow(section: t.ReviewSection): boolean {
  return (
    section.entries.length === 0 &&
    section.rows.length === 1 &&
    section.rows[0].label === section.title
  );
}

/** Review rows grouped by tab, section and entry (the review drawer and the revert-all dialog). */
export function ReviewList({ tabs, ...rowProps }: t.ReviewListProps) {
  return (
    <>
      {tabs.map((tab) => (
        <div key={tab.id} className="flex flex-col gap-3">
          <h3 className="m-0 text-xs font-semibold tracking-wide text-(--cui-color-text-muted) uppercase">
            {tab.title}
          </h3>
          {tab.sections.map((section) => (
            <SectionBlock
              key={section.key}
              section={section}
              showTitle={section.title !== tab.title && !isSoleRow(section)}
              {...rowProps}
            />
          ))}
        </div>
      ))}
    </>
  );
}
