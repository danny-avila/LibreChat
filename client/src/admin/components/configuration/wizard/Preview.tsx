import { useState } from 'react';
import type * as t from '~/admin/types';
import { ChangeRow, formatReviewValue } from '~/admin/components/configuration/review';
import { Badge, Checkbox, Icon } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';

/** The value an imported leaf sets, for keys shown without a change row (not recognised). */
function importedValue(row: t.ImportPreviewRow): t.ConfigValue {
  return row.rows.find((change) => change.item.path === row.fieldPath)?.item.after;
}

function PreviewEntry({
  row,
  isScope,
  included,
  onToggle,
}: {
  row: t.ImportPreviewRow;
  isScope: boolean;
  included: boolean;
  onToggle: (fieldPath: string, include: boolean) => void;
}) {
  const localize = useLocalize();
  const checkbox = (
    <Checkbox
      checked={included}
      onCheckedChange={(checked) => onToggle(row.fieldPath, checked === true)}
      aria-label={localize('com_admin_config_review_import_include', { label: row.label })}
    />
  );
  const single = row.rows.length === 1 && row.rows[0].item.path === row.fieldPath;
  const replaces = row.replacesList && (
    <span className="flex items-start gap-1 pl-6 text-xs text-(--cui-color-accent-warning)">
      <span aria-hidden="true" className="flex pt-0.5">
        <Icon name="warning" size="xs" />
      </span>
      {localize(
        isScope
          ? 'com_admin_config_review_warning_ownership_scope'
          : 'com_admin_config_review_warning_ownership',
      )}
    </span>
  );
  if (single && !row.unknown && !row.replacesList) {
    return (
      <ChangeRow
        row={{ ...row.rows[0], label: row.label }}
        isScope={isScope}
        leading={checkbox}
        compact
      />
    );
  }
  return (
    <li className="flex flex-col gap-1 rounded-md px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {checkbox}
        <span className="text-sm font-medium wrap-anywhere text-(--cui-color-text-default)">
          {row.label}
        </span>
        {row.unknown && (
          <Badge
            text={localize('com_admin_config_review_import_unknown_badge')}
            state="neutral"
            size="sm"
          />
        )}
      </div>
      {row.unchanged && (
        <span className="pl-6 text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_config_review_import_unchanged')}
        </span>
      )}
      {row.unknown && (
        <span className="pl-6 text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_config_review_import_unknown')}:{' '}
          <span className="font-mono text-(--cui-color-text-default)">
            {formatReviewValue(importedValue(row), localize)}
          </span>
        </span>
      )}
      {replaces}
      {!row.unknown && row.rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pl-4">
          {row.rows.map((change) => (
            <ChangeRow key={change.key} row={change} isScope={isScope} compact />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Step 3: every key of the YAML, what it changes in the target (or that it
 * already has that value), with a checkbox to leave it out, and the keys
 * that will not be imported with the reason.
 */
export function Preview({
  preview,
  targetLabel,
  isScope,
  included,
  onToggle,
}: t.ImportPreviewProps) {
  const localize = useLocalize();
  const { groups, skipped } = preview;
  const [showUnchanged, setShowUnchanged] = useState(false);
  const count = groups.reduce(
    (sum, group) => sum + group.rows.filter((row) => included.has(row.fieldPath)).length,
    0,
  );
  const unchangedCount = groups.reduce(
    (sum, group) => sum + group.rows.filter((row) => row.unchanged).length,
    0,
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  /** Unchanged settings stay listed when nothing else is (or when asked for). */
  const hideUnchanged = !showUnchanged && unchangedCount < total;
  const visible = groups
    .map((group) => ({
      ...group,
      rows: hideUnchanged ? group.rows.filter((row) => !row.unchanged) : group.rows,
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-(--cui-color-text-default)">
        {localize('com_admin_config_review_import_summary', { count, target: targetLabel })}
      </p>
      <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
        {visible.map((group) => (
          <section key={group.key} aria-label={group.title} className="flex flex-col gap-1">
            <h3 className="m-0 text-xs font-semibold tracking-wide text-(--cui-color-text-muted) uppercase">
              {group.title}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {group.rows.map((row) => (
                <PreviewEntry
                  key={row.fieldPath}
                  row={row}
                  isScope={isScope}
                  included={included.has(row.fieldPath)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </section>
        ))}
        {unchangedCount > 0 && unchangedCount < total && (
          <button
            type="button"
            onClick={() => setShowUnchanged((shown) => !shown)}
            aria-expanded={showUnchanged}
            className="cursor-pointer self-start rounded px-1.5 py-0.5 text-xs text-(--cui-color-text-muted) underline-offset-2 hover:text-(--cui-color-text-default) hover:underline"
          >
            {localize(
              showUnchanged
                ? 'com_admin_config_review_import_hide_unchanged'
                : 'com_admin_config_review_import_show_unchanged',
              { count: unchangedCount },
            )}
          </button>
        )}
        {skipped.length > 0 && (
          <section
            aria-label={localize('com_admin_config_review_import_skipped_title', {
              count: skipped.length,
            })}
            className="rounded-lg border border-(--cui-color-stroke-default) px-3 py-2 text-xs text-(--cui-color-text-muted)"
          >
            <p className="m-0 mb-1 font-medium text-(--cui-color-text-default)">
              {localize('com_admin_config_review_import_skipped_title', { count: skipped.length })}
            </p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {skipped.map((skip) => (
                <li key={skip.key} className="wrap-anywhere">
                  <span className="text-(--cui-color-text-default)">{skip.label}</span>:{' '}
                  {skip.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
