import { useCallback, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { disabledInkClasses } from '@librechat/client';
import { PrincipalType } from 'librechat-data-provider';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Title as DialogTitle, Description as DialogDescription } from '@radix-ui/react-dialog';
import type * as t from '~/admin/types';
import {
  createScopeFn,
  deleteScopeFn,
  searchUsersFn,
  toggleScopeActiveFn,
  allRolesQueryOptions,
  allGroupsQueryOptions,
  availableScopesOptions,
} from '~/admin/api';
import {
  cn,
  isSameScope,
  formatScopeName,
  findPriorityTies,
  isCurrentSelection,
  countScopeOverrides,
} from '~/admin/utils';
import { useLocalize, useDebouncedFilter } from '~/admin/hooks';
import { DecorativeIcon } from '~/admin/components/shared';
import { useQuery, useQueryClient } from '~/admin/query';
import { getScopeTypeConfig } from '~/admin/constants';
import { Badge, Button } from '~/admin/ui';

/** The admin user search needs at least this many characters. */
const MIN_USER_QUERY = 2;

const TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  [PrincipalType.ROLE]: 'com_admin_scope_type_role',
  [PrincipalType.GROUP]: 'com_admin_scope_type_group',
  [PrincipalType.USER]: 'com_admin_scope_type_user',
};

const GROUPS: ReadonlyArray<{ type: t.ScopePrincipalType; headingKey: string }> = [
  { type: PrincipalType.ROLE, headingKey: 'com_admin_scope_roles' },
  { type: PrincipalType.GROUP, headingKey: 'com_admin_scope_groups' },
  { type: PrincipalType.USER, headingKey: 'com_admin_scope_users' },
];

function principalKey(type: PrincipalType, id: string): string {
  return `${type}:${id}`;
}

export function ScopeSelector({
  open,
  onOpenChange,
  currentSelection,
  onSelect,
  permissions,
  onError,
  isDirty = false,
}: t.ScopeSelectorProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<t.ConfigScope | null>(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const userFilter = useDebouncedFilter('', () => undefined);
  const userQuery = userFilter.debouncedValue.trim();

  const { data: scopes = [], isLoading: loading } = useQuery({
    ...availableScopesOptions,
    enabled: open,
  });

  const { data: allRoles = [], isLoading: rolesLoading } = useQuery({
    ...allRolesQueryOptions,
    enabled: open && showCreate,
  });

  const { data: allGroups = [], isLoading: groupsLoading } = useQuery({
    ...allGroupsQueryOptions,
    enabled: open && showCreate,
  });

  const userSearch = useQuery({
    queryKey: ['scopeUserSearch', userQuery],
    queryFn: () => searchUsersFn({ data: { query: userQuery } }).then((r) => r.users),
    enabled: open && showCreate && userQuery.length >= MIN_USER_QUERY,
    staleTime: 30_000,
  });

  const canAssign = permissions.canAssign ?? permissions.canEdit;
  const clearUserFilter = userFilter.onChange;

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);

  const resetState = useCallback(() => {
    setShowCreate(false);
    setCreatingKey(null);
    setDeleteTarget(null);
    setDeleting(false);
    clearUserFilter('');
  }, [clearUserFilter]);

  const close = useCallback(() => {
    onOpenChange(false);
    setSearch('');
    resetState();
  }, [onOpenChange, resetState]);

  /** Opens a profile (or Base); picking the one already open just closes the selector. */
  const choose = useCallback(
    (selection: t.ScopeSelection) => {
      if (!isCurrentSelection(currentSelection, selection)) onSelect(selection);
      close();
    },
    [currentSelection, onSelect, close],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        onOpenChange(true);
        return;
      }
      close();
    },
    [onOpenChange, close],
  );

  const existingKeys = useMemo(
    () => new Set(scopes.map((s) => principalKey(s.principalType, s.principalId))),
    [scopes],
  );

  const candidates = useMemo((): Record<t.ScopePrincipalType, t.ScopeCandidate[]> => {
    const isNew = (c: t.ScopeCandidate) =>
      !existingKeys.has(principalKey(c.principalType, c.principalId));
    return {
      [PrincipalType.ROLE]: allRoles
        .map(
          (role): t.ScopeCandidate => ({
            principalType: PrincipalType.ROLE,
            principalId: role.id,
            name: role.name,
            description: role.description,
          }),
        )
        .filter(isNew),
      [PrincipalType.GROUP]: allGroups
        .map(
          (group): t.ScopeCandidate => ({
            principalType: PrincipalType.GROUP,
            principalId: group.id,
            name: group.name,
            description: group.description,
          }),
        )
        .filter(isNew),
      [PrincipalType.USER]: (userSearch.data ?? [])
        .map(
          (user): t.ScopeCandidate => ({
            principalType: PrincipalType.USER,
            principalId: user.id,
            name: user.name || user.username || user.email,
            email: user.email,
          }),
        )
        .filter(isNew),
    };
  }, [allRoles, allGroups, userSearch.data, existingKeys]);

  const scopesByType = useMemo(() => {
    const byType = new Map<PrincipalType, t.ConfigScope[]>();
    for (const scope of scopes) {
      const list = byType.get(scope.principalType);
      if (list) list.push(scope);
      else byType.set(scope.principalType, [scope]);
    }
    return byType;
  }, [scopes]);

  const handleCreate = useCallback(
    async (candidate: t.ScopeCandidate) => {
      if (creatingKey) return;
      setCreatingKey(principalKey(candidate.principalType, candidate.principalId));
      try {
        const { scope } = await createScopeFn({
          data: {
            principalType: candidate.principalType,
            principalId: candidate.principalId,
            name: candidate.name,
            ...(candidate.email && { email: candidate.email }),
          },
        });
        await queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
        choose({ type: 'SCOPE', scope });
      } catch (err) {
        setCreatingKey(null);
        onError?.(err instanceof Error ? err.message : localize('com_admin_scope_create_error'));
      }
    },
    [creatingKey, queryClient, choose, onError, localize],
  );

  const handleToggleActive = useCallback(
    async (scope: t.ConfigScope, isActive: boolean) => {
      setTogglingKey(principalKey(scope.principalType, scope.principalId));
      try {
        await toggleScopeActiveFn({
          data: { principalType: scope.principalType, principalId: scope.principalId, isActive },
        });
        await queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      } catch (err) {
        onError?.(err instanceof Error ? err.message : localize('com_admin_scope_toggle_error'));
      } finally {
        setTogglingKey(null);
      }
    },
    [queryClient, onError, localize],
  );

  const isOpenScope = useCallback(
    (scope: t.ConfigScope) =>
      currentSelection.type === 'SCOPE' && isSameScope(currentSelection.scope, scope),
    [currentSelection],
  );

  const deleteBlocked = deleteTarget != null && isDirty && isOpenScope(deleteTarget);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting || deleteBlocked) return;
    setDeleting(true);
    try {
      await deleteScopeFn({
        data: {
          principalType: deleteTarget.principalType,
          principalId: deleteTarget.principalId,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      if (isOpenScope(deleteTarget)) onSelect({ type: 'BASE' });
      setDeleteTarget(null);
      setDeleting(false);
    } catch (err) {
      setDeleting(false);
      onError?.(err instanceof Error ? err.message : localize('com_admin_scope_delete_error'));
    }
  }, [
    deleteTarget,
    deleting,
    deleteBlocked,
    queryClient,
    isOpenScope,
    onSelect,
    onError,
    localize,
  ]);

  if (!permissions.canView) return null;

  const dialogProps = {
    open,
    onOpenChange: handleOpenChange,
    overlayClassName: 'cmdk-overlay',
    contentClassName: 'cmdk-content scope-selector-dialog',
  };

  if (deleteTarget) {
    const overrideCount = countScopeOverrides(deleteTarget);
    return (
      <Command.Dialog {...dialogProps} label={localize('com_admin_scope_delete')}>
        <VisuallyHidden>
          <DialogTitle>{localize('com_admin_scope_delete')}</DialogTitle>
          <DialogDescription>
            {localize('com_admin_scope_delete_confirm', { name: formatScopeName(deleteTarget) })}
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-(--cui-color-text-default)">
            {localize('com_admin_scope_delete_confirm', { name: formatScopeName(deleteTarget) })}
          </p>
          {overrideCount > 0 && (
            <p className="text-xs text-(--cui-color-text-muted)">
              {localize('com_admin_scope_delete_impact', { count: overrideCount })}
            </p>
          )}
          {deleteBlocked && (
            <p role="alert" className="text-xs text-(--cui-color-text-danger)">
              {localize('com_admin_scope_delete_dirty')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              htmlType="button"
              type="secondary"
              label={localize('com_admin_ui_cancel')}
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            />
            <Button
              htmlType="button"
              type="danger"
              label={localize(deleting ? 'com_admin_scope_deleting' : 'com_admin_scope_delete')}
              loading={deleting}
              disabled={deleting || deleteBlocked}
              onClick={handleDelete}
            />
          </div>
        </div>
      </Command.Dialog>
    );
  }

  if (showCreate) {
    const loadingByType: Record<t.ScopePrincipalType, boolean> = {
      [PrincipalType.ROLE]: rolesLoading,
      [PrincipalType.GROUP]: groupsLoading,
      [PrincipalType.USER]: userSearch.isFetching,
    };
    const emptyText = (type: t.ScopePrincipalType): string => {
      if (type === PrincipalType.ROLE) {
        return localize(
          allRoles.length === 0 ? 'com_admin_scope_no_roles' : 'com_admin_scope_all_roles_used',
        );
      }
      if (type === PrincipalType.GROUP) {
        return localize(
          allGroups.length === 0 ? 'com_admin_scope_no_groups' : 'com_admin_scope_all_groups_used',
        );
      }
      if (userQuery.length < MIN_USER_QUERY) return localize('com_admin_scope_user_search_hint');
      if (userSearch.isError) return localize('com_admin_scope_user_search_error');
      return localize('com_admin_scope_user_search_empty');
    };

    return (
      <Command.Dialog {...dialogProps} label={localize('com_admin_scope_create_title')}>
        <VisuallyHidden>
          <DialogTitle>{localize('com_admin_scope_create_title')}</DialogTitle>
          <DialogDescription>{localize('com_admin_scope_create_desc')}</DialogDescription>
        </VisuallyHidden>
        <div className="flex items-center gap-2 border-b border-(--cui-color-stroke-default) px-3">
          <button
            type="button"
            onClick={() => {
              setShowCreate(false);
              clearUserFilter('');
            }}
            aria-label={localize('com_admin_scope_create_back')}
            title={localize('com_admin_scope_create_back')}
            className="flex cursor-pointer items-center rounded-sm p-1 text-(--cui-color-text-muted) hover:text-(--cui-color-text-default)"
          >
            <DecorativeIcon name="chevron-left" size="sm" />
          </button>
          <Command.Input
            value={userFilter.value}
            onValueChange={userFilter.onChange}
            placeholder={localize('com_admin_scope_create_search')}
            className="flex min-w-0 flex-1 bg-transparent py-3 text-sm text-(--cui-color-text-default) outline-none placeholder:text-(--cui-color-text-muted)"
          />
          {creatingKey && (
            <span aria-hidden="true" className="shrink-0">
              <DecorativeIcon name="loading-animated" size="sm" />
            </span>
          )}
        </div>
        <Command.List ref={listRef} className="max-h-95 overflow-y-auto p-2 pb-3">
          {GROUPS.map(({ type, headingKey }) => {
            const config = getScopeTypeConfig(type);
            const items = candidates[type];
            return (
              <Command.Group
                key={type}
                heading={localize(headingKey)}
                className="cmdk-group"
                forceMount={type === PrincipalType.USER}
              >
                {items.map((candidate) => {
                  const key = principalKey(candidate.principalType, candidate.principalId);
                  const detail = candidate.email || candidate.description;
                  return (
                    <Command.Item
                      key={key}
                      value={`${key} ${candidate.name} ${candidate.email ?? ''} ${candidate.description ?? ''}`}
                      onSelect={() => handleCreate(candidate)}
                      disabled={creatingKey != null}
                      className={cn(
                        'scope-item',
                        creatingKey != null && 'opacity-60',
                        disabledInkClasses,
                      )}
                    >
                      <span aria-hidden="true" className={cn('scope-icon', config.colorClass)}>
                        <DecorativeIcon name={config.icon} size="sm" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-(--cui-color-text-default)">
                          {candidate.name}
                        </span>
                        {detail && (
                          <span className="truncate text-xs text-(--cui-color-text-muted)">
                            {detail}
                          </span>
                        )}
                      </span>
                      {creatingKey === key && (
                        <span aria-hidden="true" className="shrink-0">
                          <DecorativeIcon name="loading-animated" size="xs" />
                        </span>
                      )}
                    </Command.Item>
                  );
                })}
                {items.length === 0 && (
                  <p className="px-3 py-2 text-xs text-(--cui-color-text-muted)">
                    {loadingByType[type] ? localize('com_admin_ui_loading') : emptyText(type)}
                  </p>
                )}
              </Command.Group>
            );
          })}
        </Command.List>
      </Command.Dialog>
    );
  }

  const baseConfig = getScopeTypeConfig('BASE');

  return (
    <Command.Dialog {...dialogProps} label={localize('com_admin_scope_select')}>
      <VisuallyHidden>
        <DialogTitle>{localize('com_admin_scope_select')}</DialogTitle>
        <DialogDescription>{localize('com_admin_scope_precedence')}</DialogDescription>
      </VisuallyHidden>
      <div className="flex items-center gap-2 border-b border-(--cui-color-stroke-default) px-4">
        <Command.Input
          value={search}
          onValueChange={handleSearchChange}
          placeholder={localize('com_admin_scope_search_profiles')}
          className="flex min-w-0 flex-1 bg-transparent py-3 text-sm text-(--cui-color-text-default) outline-none placeholder:text-(--cui-color-text-muted)"
        />
        {canAssign && (
          <Button
            htmlType="button"
            type="secondary"
            iconLeft="plus"
            label={localize('com_admin_scope_create')}
            onClick={() => setShowCreate(true)}
          />
        )}
      </div>

      <Command.List ref={listRef} className="max-h-95 overflow-y-auto p-2 pb-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8">
            <span aria-hidden="true">
              <DecorativeIcon name="loading-animated" size="sm" />
            </span>
            <span className="text-sm text-(--cui-color-text-muted)">
              {localize('com_admin_ui_loading')}
            </span>
          </div>
        ) : (
          <>
            <Command.Empty className="px-4 py-8 text-center text-sm text-(--cui-color-text-muted)">
              {localize('com_admin_scope_no_profiles_found')}
            </Command.Empty>

            <Command.Group heading={localize('com_admin_scope_base_config')} className="cmdk-group">
              <Command.Item
                value="base-configuration"
                onSelect={() => choose({ type: 'BASE' })}
                className="scope-item"
                data-active={currentSelection.type === 'BASE'}
              >
                <span aria-hidden="true" className={cn('scope-icon', baseConfig.colorClass)}>
                  <DecorativeIcon name={baseConfig.icon} size="sm" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-(--cui-color-text-default)">
                    {localize('com_admin_scope_base_config')}
                  </span>
                  <span className="text-xs text-(--cui-color-text-muted)">
                    {localize('com_admin_scope_base_applies')}
                  </span>
                </span>
                {currentSelection.type === 'BASE' && (
                  <span aria-hidden="true" className="shrink-0 text-(--cui-color-accent)">
                    <DecorativeIcon name="check" size="sm" />
                  </span>
                )}
              </Command.Item>
            </Command.Group>

            {GROUPS.map(({ type, headingKey }) => {
              const list = scopesByType.get(type);
              if (!list?.length) return null;
              return (
                <Command.Group key={type} heading={localize(headingKey)} className="cmdk-group">
                  {list.map((scope) => {
                    const key = principalKey(scope.principalType, scope.principalId);
                    const isOpen = isOpenScope(scope);
                    return (
                      <ScopeRow
                        key={key}
                        scope={scope}
                        isSelected={isOpen}
                        ties={findPriorityTies(scope, scopes)}
                        onSelect={(s) => choose({ type: 'SCOPE', scope: s })}
                        onDelete={canAssign ? setDeleteTarget : undefined}
                        deleteBlockedReason={
                          isOpen && isDirty ? localize('com_admin_scope_delete_dirty') : undefined
                        }
                        onToggleActive={canAssign ? handleToggleActive : undefined}
                        toggling={togglingKey === key}
                      />
                    );
                  })}
                </Command.Group>
              );
            })}
          </>
        )}
      </Command.List>
      <p className="border-t border-(--cui-color-stroke-default) px-4 py-2 text-xs text-(--cui-color-text-muted)">
        {localize('com_admin_scope_precedence')}
      </p>
    </Command.Dialog>
  );
}

function ScopeRow({
  scope,
  isSelected,
  ties,
  onSelect,
  onDelete,
  deleteBlockedReason,
  onToggleActive,
  toggling,
}: t.ScopeRowProps) {
  const localize = useLocalize();
  const config = getScopeTypeConfig(scope.principalType);
  const name = formatScopeName(scope);
  const overrideCount = countScopeOverrides(scope);
  const conflicts = ties.filter((tie) => tie.sharedPaths.length > 0);
  const tieText =
    conflicts.length > 0
      ? localize('com_admin_scope_tie_short', {
          names: conflicts.map((tie) => formatScopeName(tie.scope)).join(', '),
        })
      : undefined;

  const details = [
    localize('com_admin_scope_priority', { priority: scope.priority }),
    scope.memberCount != null &&
      localize('com_admin_scope_member_count', { count: scope.memberCount }),
    overrideCount > 0
      ? localize('com_admin_scope_override_count', { count: overrideCount })
      : localize('com_admin_scope_no_overrides'),
  ].filter((item): item is string => typeof item === 'string');

  const value = `${localize(TYPE_LABEL_KEYS[scope.principalType] ?? '')} ${scope.name} ${scope.email ?? ''} ${scope.principalId}`;
  const revealAction =
    'opacity-0 transition-opacity group-hover:opacity-100 group-has-[[data-selected=true]]:opacity-100 group-data-[active=true]:opacity-100';

  /**
   * Activate and delete are options of their own beside the profile's option
   * (a listbox holds only options, and an option's content is presentational),
   * so the arrow keys reach them and Enter runs them, like a click.
   */
  return (
    <div className="group flex items-center gap-1" data-active={isSelected}>
      <Command.Item
        value={value}
        onSelect={() => onSelect(scope)}
        className="scope-item min-w-0 flex-1"
        data-active={isSelected}
      >
        <span aria-hidden="true" className={cn('scope-icon', config.colorClass)}>
          <DecorativeIcon name={config.icon} size="sm" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-(--cui-color-text-default)">
              {scope.name}
            </span>
            {scope.email && scope.email !== scope.name && (
              <span className="truncate text-xs text-(--cui-color-text-muted)">{scope.email}</span>
            )}
            {!scope.isActive && (
              <Badge text={localize('com_admin_scope_inactive')} state="warning" size="sm" />
            )}
            {tieText && (
              <span
                className="flex shrink-0 items-center text-(--cui-color-accent-warning)"
                title={tieText}
              >
                <DecorativeIcon name="warning" size="xs" />
                <span className="sr-only">{tieText}</span>
              </span>
            )}
          </span>
          <span className="text-xs text-(--cui-color-text-muted)">{details.join(' · ')}</span>
        </span>
        {isSelected && (
          <span aria-hidden="true" className="shrink-0 text-(--cui-color-accent)">
            <DecorativeIcon name="check" size="sm" />
          </span>
        )}
      </Command.Item>
      {onToggleActive && (
        <Command.Item
          value={`${value} active`}
          onSelect={() => onToggleActive(scope, !scope.isActive)}
          disabled={toggling}
          aria-checked={scope.isActive}
          className="scope-action"
          title={localize(
            scope.isActive ? 'com_admin_scope_active_hint' : 'com_admin_scope_inactive_hint',
          )}
        >
          <span aria-hidden="true" className="scope-switch" data-checked={scope.isActive} />
          <span className="sr-only">{localize('com_admin_scope_active_option', { name })}</span>
        </Command.Item>
      )}
      {onDelete && (
        <Command.Item
          value={`${value} delete`}
          onSelect={() => onDelete(scope)}
          disabled={deleteBlockedReason != null}
          className={cn('scope-action hover:text-(--cui-color-accent-danger)', revealAction)}
          title={deleteBlockedReason ?? localize('com_admin_scope_delete_named', { name })}
        >
          <DecorativeIcon name="trash" size="xs" />
          <span className="sr-only">{localize('com_admin_scope_delete_named', { name })}</span>
        </Command.Item>
      )}
    </div>
  );
}

export function ScopeTriggerButton({
  currentSelection,
  onClick,
  loading,
  unavailable,
}: t.ScopeTriggerButtonProps) {
  const localize = useLocalize();

  const label = (() => {
    if (unavailable && currentSelection.type === 'BASE') {
      return localize('com_admin_scope_profile_unavailable');
    }
    if (loading) return localize('com_admin_scope_loading_profile');
    if (currentSelection.type === 'BASE') return localize('com_admin_scope_base_config');
    return formatScopeName(currentSelection.scope);
  })();

  const typeKey =
    currentSelection.type === 'BASE' ? ('BASE' as const) : currentSelection.scope.principalType;
  const config = getScopeTypeConfig(typeKey);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-72 min-w-0 shrink cursor-pointer items-center gap-1.5 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-3 py-1.5 text-sm text-(--cui-color-text-default) transition-colors hover:bg-(--cui-color-background-hover)"
      aria-label={`${localize('com_admin_scope_select')}: ${label}`}
      title={label}
    >
      <span aria-hidden="true" className={cn('shrink-0', config.colorClass)}>
        <DecorativeIcon name={config.icon} size="xs" />
      </span>
      <span className="truncate">{label}</span>
      <span aria-hidden="true" className="shrink-0 text-(--cui-color-text-muted)">
        <DecorativeIcon name="chevron-down" size="xs" />
      </span>
    </button>
  );
}
