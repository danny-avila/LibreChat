import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { diffList, formatReviewValue, isListChange, isShowableSecret } from './format';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';
import { Icon } from '~/admin/ui';

/** The row's enum option labels, so values read as the page's options ("Remaining tokens"). */
const ValueLabelsContext = createContext<Readonly<Record<string, string>> | undefined>(undefined);

/** `formatReviewValue` with the row's option labels. */
function useFormatValue(): (value: t.ConfigValue) => string {
  const localize = useLocalize();
  const labels = useContext(ValueLabelsContext);
  return (value) => formatReviewValue(value, localize, labels);
}

/** The kind chip of a change: the page's state-chip colours, which meet AA contrast in both themes. */
const KIND_BADGE: Record<t.ChangeKind, { key: string; chip: string }> = {
  added: { key: 'com_admin_config_review_kind_added', chip: 'state-chip-added' },
  changed: { key: 'com_admin_config_review_kind_changed', chip: 'state-chip-changed' },
  removed: { key: 'com_admin_config_review_kind_removed', chip: 'state-chip-error' },
  reverted: { key: 'com_admin_config_review_kind_reverted', chip: 'state-chip-warning' },
  hidden: { key: 'com_admin_config_review_kind_hidden', chip: 'state-chip-error' },
  unhidden: { key: 'com_admin_config_review_kind_unhidden', chip: 'state-chip-warning' },
  renamed: { key: 'com_admin_config_review_kind_changed', chip: 'state-chip-changed' },
};

/**
 * The kind chip of a row: a plain list change that only adds (or only
 * removes) items reads "Added" (or "Removed"), not "Changed".
 */
function badgeOf(item: t.ChangeSummaryItem): { key: string; chip: string } {
  if (item.kind !== 'changed' || !isListChange(item)) return KIND_BADGE[item.kind];
  const { added, removed } = diffList(item.before ?? item.revertTarget?.value, item.after);
  if (added.length > 0 && removed.length === 0) {
    return { key: 'com_admin_config_review_kind_list_added', chip: 'state-chip-added' };
  }
  if (removed.length > 0 && added.length === 0) {
    return { key: 'com_admin_config_review_kind_removed', chip: 'state-chip-error' };
  }
  return KIND_BADGE.changed;
}

const ENTRY_TITLE_KEYS: Partial<Record<t.ChangeKind, string>> = {
  added: 'com_admin_config_review_added_entry',
  removed: 'com_admin_config_review_removed_entry',
  renamed: 'com_admin_config_review_renamed_entry',
  reverted: 'com_admin_config_review_reverted_entry',
};

const SOURCE_KEYS: Record<t.ProvenanceSource, string> = {
  default: 'com_admin_config_review_source_default',
  runtimeDefault: 'com_admin_config_review_source_runtimeDefault',
  yaml: 'com_admin_config_review_source_yaml',
  admin: 'com_admin_config_review_source_admin',
  scope: 'com_admin_config_review_source_scope',
  inherited: 'com_admin_config_review_source_inherited',
};

/** Row-level warnings; `yamlEntry` is reported as a blocking problem on the row instead. */
const WARNING_KEYS: Partial<Record<t.ChangeWarning, string>> = {
  emptyAllowlist: 'com_admin_config_review_warning_empty_allowlist',
  shadowed: 'com_admin_config_review_warning_shadowed',
  shadowedBlock: 'com_admin_config_review_warning_shadowed_block',
};

function ActionButton({
  icon,
  label,
  ariaLabel,
  onClick,
}: {
  icon: t.IconName;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-(--cui-color-text-muted) transition-colors hover:bg-(--cui-color-background-hover) hover:text-(--cui-color-text-default)"
    >
      <span aria-hidden="true" className="flex">
        <Icon name={icon} size="xs" />
      </span>
      {label}
    </button>
  );
}

function Value({
  children,
  muted,
  strike,
}: {
  children: ReactNode;
  muted?: boolean;
  strike?: boolean;
}) {
  return (
    <span
      className={cn(
        'text-1xs rounded bg-(--cui-color-background-muted) px-1 font-mono wrap-anywhere',
        muted ? 'text-(--cui-color-text-muted)' : 'text-(--cui-color-text-default)',
        strike && 'line-through decoration-(--cui-color-text-muted)',
      )}
    >
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="text-(--cui-color-text-muted)">
      →
    </span>
  );
}

/** "1,000,000 (librechat.yaml)" or, for a profile with no value of its own, "Not set · inherits 1,000,000 from Base". */
function LowerValue({ target, secret }: { target: t.RevertTarget; secret?: boolean }) {
  const localize = useLocalize();
  const format = useFormatValue();
  const value =
    secret && !isShowableSecret(target.value)
      ? localize('com_admin_config_review_secret_set')
      : format(target.value);
  if (target.source === 'inherited') {
    return <Value muted>{localize('com_admin_config_review_inherits', { value })}</Value>;
  }
  return (
    <Value muted>
      {localize('com_admin_config_review_value_source', {
        value,
        source: localize(SOURCE_KEYS[target.source]),
      })}
    </Value>
  );
}

function SecretChange({ item }: { item: t.ChangeSummaryItem }) {
  const localize = useLocalize();
  const format = useFormatValue();
  const before = item.before ?? item.revertTarget?.value;
  if (item.kind === 'reverted' || item.after == null) {
    const target = item.revertTarget;
    return (
      <span className="flex flex-wrap items-center gap-1">
        <Value muted>{localize('com_admin_config_review_secret_removed')}</Value>
        {target && target.value != null && (
          <>
            <Arrow />
            <Value>
              {localize('com_admin_config_review_reverts_to', {
                value: isShowableSecret(target.value)
                  ? format(target.value)
                  : localize('com_admin_config_review_secret_hidden'),
                source: localize(SOURCE_KEYS[target.source]),
              })}
            </Value>
          </>
        )}
      </span>
    );
  }
  const afterText = isShowableSecret(item.after)
    ? format(item.after)
    : localize(
        before == null
          ? 'com_admin_config_review_secret_set'
          : 'com_admin_config_review_secret_replaced',
      );
  return (
    <span className="flex flex-wrap items-center gap-1">
      {before != null && isShowableSecret(before) && (
        <>
          <Value muted strike>
            {format(before)}
          </Value>
          <Arrow />
        </>
      )}
      <Value>{afterText}</Value>
    </span>
  );
}

function ListChange({ item }: { item: t.ChangeSummaryItem }) {
  const localize = useLocalize();
  const format = useFormatValue();
  const before = item.before ?? item.revertTarget?.value;
  const { added, removed, reordered } = diffList(before, item.after);
  if (reordered) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_config_review_list_reordered')}:
        </span>
        <Value>{format(item.after)}</Value>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {added.map((value, i) => (
        <span
          key={`+${i}`}
          className="bg-status-success-subtle text-1xs rounded px-1 font-mono wrap-anywhere text-(--cui-color-text-default)"
          aria-label={`${localize('com_admin_config_review_list_added')}: ${format(value)}`}
        >
          + {format(value)}
        </span>
      ))}
      {removed.map((value, i) => (
        <span
          key={`-${i}`}
          className="bg-status-error-subtle text-1xs rounded px-1 font-mono wrap-anywhere text-(--cui-color-text-default) line-through"
          aria-label={`${localize('com_admin_config_review_list_removed')}: ${format(value)}`}
        >
          − {format(value)}
        </span>
      ))}
    </span>
  );
}

/** A hidden inherited value ("1,000,000 (Base) → Hidden"), or one shown again ("Hidden → inherits 1,000,000 from Base"). */
function VisibilityChange({ item }: { item: t.ChangeSummaryItem }) {
  const localize = useLocalize();
  const hidden = (
    <Value muted={item.kind === 'unhidden'}>{localize('com_admin_config_review_hidden')}</Value>
  );
  if (item.kind === 'hidden') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {item.revertTarget && <LowerValue target={item.revertTarget} secret={item.secret} />}
        <Arrow />
        {hidden}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {hidden}
      <Arrow />
      {item.revertTarget ? (
        <LowerValue target={item.revertTarget} secret={item.secret} />
      ) : (
        <Value>{localize('com_admin_config_field_not_set')}</Value>
      )}
    </span>
  );
}

/** BEFORE → AFTER for one value, with the layer it reverts to or inherits from. */
function ValueChange({ item, isScope }: { item: t.ChangeSummaryItem; isScope: boolean }) {
  const localize = useLocalize();
  const format = useFormatValue();
  if (item.kind === 'hidden' || item.kind === 'unhidden') return <VisibilityChange item={item} />;
  if (item.secret) return <SecretChange item={item} />;
  if (isListChange(item)) return <ListChange item={item} />;
  if (item.kind === 'reverted') {
    return (
      <span className="flex flex-wrap items-center gap-1">
        <Value muted strike>
          {format(item.before)}
        </Value>
        <Arrow />
        {item.revertTarget ? (
          <Value>
            {localize('com_admin_config_review_reverts_to', {
              value: format(item.revertTarget.value),
              source: localize(SOURCE_KEYS[item.revertTarget.source]),
            })}
          </Value>
        ) : (
          <Value>{localize('com_admin_config_field_not_set')}</Value>
        )}
      </span>
    );
  }
  const showLower = item.before == null && item.revertTarget != null;
  const hideBefore = item.before == null && !showLower && !isScope;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {showLower && item.revertTarget && <LowerValue target={item.revertTarget} />}
      {!showLower && !hideBefore && (
        <Value muted strike={item.before != null}>
          {format(item.before)}
        </Value>
      )}
      {!hideBefore && <Arrow />}
      <Value>
        {item.after == null ? localize('com_admin_config_review_kind_removed') : format(item.after)}
      </Value>
    </span>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs text-(--cui-color-accent-warning)">
      <span aria-hidden="true" className="flex">
        <Icon name="warning" size="xs" />
      </span>
      {children}
    </span>
  );
}

/** Row warnings, and the value saved meanwhile when someone else changed it since the edit (SV-8). */
function RowWarnings({ item }: { item: t.ChangeSummaryItem }) {
  const localize = useLocalize();
  const format = useFormatValue();
  const keys = (item.warnings ?? [])
    .map((warning) => WARNING_KEYS[warning])
    .filter((key): key is string => key != null);
  const drift = item.drift;
  if (keys.length === 0 && !drift) return null;
  return (
    <>
      {keys.map((key) => (
        <Warning key={key}>{localize(key)}</Warning>
      ))}
      {drift && (
        <Warning>
          {localize('com_admin_config_review_drift', {
            value: item.secret
              ? localize('com_admin_config_review_secret_set')
              : format(drift.current),
          })}
        </Warning>
      )}
    </>
  );
}

function RowIssues({ issues }: { issues?: t.ReviewIssue[] }) {
  if (!issues?.length) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {issues.map((issue, i) => (
        <li
          key={`${issue.path ?? ''}:${i}`}
          className="text-xs wrap-anywhere text-(--cui-color-text-danger)"
        >
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** One change of the review: its label, BEFORE → AFTER, warnings, problems, and Revert / Go to field. */
export function ChangeRow({
  row,
  isScope,
  onRevert,
  onGoTo,
  leading,
  compact,
}: t.ReviewRowViewProps) {
  const localize = useLocalize();
  const { item } = row;
  const isEntry = row.noun != null;
  const entryTitleKey = ENTRY_TITLE_KEYS[item.kind];
  const badge = badgeOf(item);
  const hasIssue = (row.issues?.length ?? 0) > 0;

  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-md px-2 py-1.5',
        hasIssue && 'bg-status-error-subtle ring-status-error-border ring-1',
      )}
      data-review-path={item.path}
    >
      <div className="flex min-w-0 items-start gap-2">
        {leading}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {isEntry && entryTitleKey ? (
              <span className="text-sm text-(--cui-color-text-default)">
                <span className="text-(--cui-color-text-muted)">
                  {localize(entryTitleKey, { noun: row.noun ?? '' })}
                </span>{' '}
                <span className="font-medium wrap-anywhere">{row.label}</span>
                {item.kind === 'renamed' && item.previousIdentity && (
                  <span className="text-(--cui-color-text-muted)">
                    {' '}
                    ({item.previousIdentity} → {row.label})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm font-medium wrap-anywhere text-(--cui-color-text-default)">
                {row.label}
              </span>
            )}
            {!isEntry && (
              <span className={cn('state-chip', badge.chip)}>{localize(badge.key)}</span>
            )}
          </div>
          <ValueLabelsContext.Provider value={row.valueLabels}>
            {!isEntry && <ValueChange item={item} isScope={isScope} />}
            <RowWarnings item={item} />
          </ValueLabelsContext.Provider>
          <RowIssues issues={row.issues} />
          {row.details && row.details.length > 0 && (
            <dl className="m-0 grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-3 gap-y-0.5 pl-1 text-xs">
              {row.details.map((detail) => (
                <div key={detail.key} className="contents">
                  <dt className="text-(--cui-color-text-muted)">{detail.label}</dt>
                  <dd className="m-0 min-w-0 font-mono wrap-anywhere text-(--cui-color-text-default)">
                    {detail.item.secret && !isShowableSecret(detail.item.after)
                      ? localize('com_admin_config_review_secret_set')
                      : formatReviewValue(detail.item.after, localize)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {!compact && (onRevert || onGoTo) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onRevert && (
              <ActionButton
                icon="history"
                label={localize('com_admin_config_review_revert')}
                ariaLabel={localize('com_admin_config_review_revert_aria', { label: row.label })}
                onClick={() => onRevert(row)}
              />
            )}
            {onGoTo && (
              <ActionButton
                icon="arrow-right"
                label={localize('com_admin_config_review_go_to')}
                ariaLabel={localize('com_admin_config_review_go_to_aria', { label: row.label })}
                onClick={() => onGoTo(row)}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}
