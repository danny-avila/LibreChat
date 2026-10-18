import { useMemo, useState } from 'react';
import type * as t from '~/admin/types';
import { formatScopeName, isSameScope, findPriorityTies, countScopeOverrides } from '~/admin/utils';
import { availableScopesOptions, toggleScopeActiveFn } from '~/admin/api';
import { ScopeOverridesDialog } from './ScopeOverridesDialog';
import { useQuery, useQueryClient } from '~/admin/query';
import { getScopeTypeConfig } from '~/admin/constants';
import { Badge, Button, Icon } from '~/admin/ui';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

const TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  role: 'com_admin_scope_type_role',
  group: 'com_admin_scope_type_group',
  user: 'com_admin_scope_type_user',
};

/**
 * Persistent context bar shown under the tabs while a profile is open: which
 * profile is being edited, its priority (with ties), members, override count,
 * whether it is active, and the way back to Base (WS8: PR-1, PR-2).
 */
export function ScopeBar({
  scope,
  onBackToBase,
  onError,
  values,
  pendingResets,
  onRevert,
  onUnhide,
  visibility,
  fields,
  config: pageConfig,
  onRevertEntry,
  isEntryPending,
}: t.ScopeBarProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [toggling, setToggling] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const { data: scopes, isSuccess, isFetching } = useQuery(availableScopesOptions);

  const live = scopes?.find((s) => isSameScope(s, scope));
  const current = live ?? scope;
  const isDeleted = isSuccess && !isFetching && !live;
  const ties = useMemo(() => findPriorityTies(current, scopes ?? []), [current, scopes]);
  const conflicts = ties.filter((tie) => tie.sharedPaths.length > 0);
  const config = getScopeTypeConfig(current.principalType);
  const typeLabel = localize(TYPE_LABEL_KEYS[current.principalType] ?? config.labelKey);
  const overrideCount = countScopeOverrides(current);

  const tieNames = (list: t.ScopePriorityTie[]) =>
    list
      .map(
        (tie) =>
          `${formatScopeName(tie.scope)} (${localize(TYPE_LABEL_KEYS[tie.scope.principalType] ?? '')})`,
      )
      .join(', ');

  const setActive = async (isActive: boolean) => {
    setToggling(true);
    try {
      await toggleScopeActiveFn({
        data: { principalType: current.principalType, principalId: current.principalId, isActive },
      });
      await queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : localize('com_admin_scope_toggle_error'));
    } finally {
      setToggling(false);
    }
  };

  const details = [
    localize('com_admin_scope_priority', { priority: current.priority }),
    current.memberCount != null &&
      localize('com_admin_scope_member_count', { count: current.memberCount }),
    overrideCount > 0
      ? localize('com_admin_scope_override_count', { count: overrideCount })
      : localize('com_admin_scope_no_overrides'),
  ].filter((item): item is string => typeof item === 'string');

  return (
    <section
      aria-label={localize('com_admin_scope_bar_label')}
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-l-4 border-(--cui-color-stroke-default) bg-(--cui-color-background-muted) px-3 py-2',
        config.accentBorderClass,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn('mt-0.5 flex shrink-0 items-center', config.colorClass)}
        >
          <Icon name={config.icon} size="sm" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm text-(--cui-color-text-default)">
            <span className="text-(--cui-color-text-muted)">
              {localize('com_admin_scope_bar_editing')}
            </span>{' '}
            <strong className="font-semibold wrap-break-word">
              {localize('com_admin_scope_bar_name', {
                type: typeLabel,
                name: formatScopeName(current),
              })}
            </strong>
          </p>
          <p
            className="flex flex-wrap items-center gap-x-1.5 text-xs text-(--cui-color-text-muted)"
            title={localize('com_admin_scope_priority_help')}
          >
            {details.map((item, i) => (
              <span key={item} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">·</span>}
                {item}
              </span>
            ))}
          </p>
          {conflicts.length > 0 && (
            <p
              role="status"
              className="flex items-start gap-1 text-xs text-(--cui-color-text-default)"
            >
              <span aria-hidden="true" className="mt-px shrink-0 text-(--cui-color-accent-warning)">
                <Icon name="warning" size="xs" />
              </span>
              <span>
                {localize('com_admin_scope_tie_conflict', {
                  names: tieNames(conflicts),
                  count: new Set(conflicts.flatMap((tie) => tie.sharedPaths)).size,
                })}
              </span>
            </p>
          )}
          {conflicts.length === 0 && ties.length > 0 && (
            <p className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_scope_tie_note', { names: tieNames(ties) })}
            </p>
          )}
          {isDeleted && (
            <p role="alert" className="text-xs text-(--cui-color-text-danger)">
              {localize('com_admin_scope_deleted')}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!current.isActive && !isDeleted && (
          <span className="flex items-center gap-2">
            <Badge text={localize('com_admin_scope_inactive')} state="warning" size="sm" />
            <span className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_scope_inactive_hint')}
            </span>
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_scope_activate')}
              loading={toggling}
              disabled={toggling}
              onClick={() => setActive(true)}
            />
          </span>
        )}
        {!isDeleted && (
          <Button
            htmlType="button"
            type="secondary"
            iconLeft="eye"
            label={localize('com_admin_scope_view_overrides')}
            onClick={() => setOverridesOpen(true)}
          />
        )}
        <Button
          htmlType="button"
          type="secondary"
          iconLeft="arrow-left"
          label={localize('com_admin_scope_back_to_base')}
          onClick={onBackToBase}
        />
      </div>
      <ScopeOverridesDialog
        open={overridesOpen}
        scope={current}
        values={values}
        pendingResets={pendingResets}
        onRevert={onRevert}
        onUnhide={onUnhide}
        visibility={visibility}
        fields={fields}
        config={pageConfig}
        onRevertEntry={onRevertEntry}
        isEntryPending={isEntryPending}
        onClose={() => setOverridesOpen(false)}
      />
    </section>
  );
}
