import { useState } from 'react';
import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { allRolesQueryOptions, createScopeFn } from '~/admin/api';
import { notifyError, parseScopeParam } from '~/admin/utils';
import { useQuery, useQueryClient } from '~/admin/query';
import { principalTypeLabel } from './review/group';
import { useLocalize } from '~/admin/hooks';
import { Button, Icon } from '~/admin/ui';

/** "Role: ADMIN" for a `?scope=` value; a group or user id is shown as given. */
function describeParam(value: string, localize: t.LocalizeFn): string {
  const param = parseScopeParam(value);
  if (param?.kind !== 'principal') return value;
  return `${principalTypeLabel(param.principalType, localize)}: ${param.principalId}`;
}

/**
 * A `?scope=` link to a profile that doesn't exist (yet): names it, says the
 * page below is Base shown read-only (nothing is saved to the missing
 * profile), and offers to create the profile for a role that exists (roles,
 * whose id is their name; the name must match exactly) or to edit Base
 * instead. A role that doesn't exist is said so, with no Create.
 */
export function ScopeNotFound({ scopeParam, onEditBase, onCreated }: t.ScopeNotFoundProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const param = parseScopeParam(scopeParam);
  const roleParam =
    param?.kind === 'principal' && param.principalType === PrincipalType.ROLE
      ? param.principalId
      : null;
  const { data: roles } = useQuery({ ...allRolesQueryOptions, enabled: roleParam != null });
  const roleExists = roleParam != null && (roles?.some((r) => r.name === roleParam) ?? false);
  const roleMissing = roleParam != null && roles != null && !roleExists;
  const role = roleExists ? roleParam : null;

  const create = async () => {
    if (!role || creating) return;
    setCreating(true);
    try {
      const { scope } = await createScopeFn({
        data: { principalType: PrincipalType.ROLE, principalId: role, name: role },
      });
      await queryClient.invalidateQueries({ queryKey: ['availableScopes'] });
      onCreated(scope);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : localize('com_admin_scope_create_error'));
    } finally {
      setCreating(false);
    }
  };

  const messageKey = roleMissing
    ? 'com_admin_config_shell_scope_role_missing'
    : 'com_admin_config_shell_scope_not_found';

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-md border border-(--cui-color-stroke-default) bg-(--cui-color-background-secondary) px-3 py-2 text-sm text-(--cui-color-text-default)"
    >
      <span aria-hidden="true" className="flex text-(--cui-color-text-muted)">
        <Icon name="info-in-circle" size="sm" />
      </span>
      <span className="min-w-48 flex-1">
        {localize(messageKey, {
          scope: describeParam(scopeParam, localize),
          role: roleParam ?? '',
        })}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {role && (
          <Button
            htmlType="button"
            type="primary"
            label={localize(
              creating ? 'com_admin_ui_loading' : 'com_admin_config_shell_scope_create',
            )}
            disabled={creating}
            onClick={create}
          />
        )}
        <Button
          htmlType="button"
          type="secondary"
          label={localize('com_admin_config_shell_scope_edit_base')}
          onClick={onEditBase}
        />
      </span>
    </div>
  );
}
