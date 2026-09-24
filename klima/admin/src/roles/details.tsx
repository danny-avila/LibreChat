import { useState } from 'react';

import type { AdminRoleResponse, AdminRoleDetail, UpdateRoleBody } from './types';
import type { ApiClient, ApiError } from '../api';

import { buttonPrimary, inputField, ErrorNote, WarningNote } from '../ui';
import { SYSTEM_ROLE_REASON, isSystemRole } from './system';
import { rolePath } from './paths';

interface RoleDetailsFormProps {
  client: ApiClient;
  role: AdminRoleDetail;
  onUpdated: (role: AdminRoleDetail, message: string) => void;
}

/** What each refusal from `PATCH /api/admin/roles/:name` means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API rejected the new name or description: a name stops at 500 characters, carries no control characters, and cannot be “members” or “permissions”.',
  403: 'The API refuses to rename a system role, and refuses ADMIN or USER as a new name.',
  404: 'That role no longer exists. Reload the list.',
  409: 'Another role already holds that name.',
};

/**
 * A rename rewrites the `role` field of every member, but the role-scoped config override,
 * ACL entries and capability grants stay keyed by the old name — see the report in the
 * pull request. Warn before the write rather than after.
 */
const RENAME_WARNING =
  'Renaming moves every member to the new name, but anything else keyed by the old name — the role’s config override, its ACL entries on shared agents and prompts, and its system capability grants — stays behind under the old name and has to be recreated. Prefer a new role over a rename when the role is already in use.';

export const RoleDetailsForm = ({ client, role, onUpdated }: RoleDetailsFormProps) => {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const system = isSystemRole(role.name);
  const trimmedName = name.trim();
  const isRename = !system && trimmedName !== '' && trimmedName !== role.name;
  const descriptionChanged = description !== (role.description ?? '');
  const canSubmit = (isRename || descriptionChanged) && !submitting;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);

    const body: UpdateRoleBody = {};
    if (isRename) {
      body.name = trimmedName;
    }
    if (descriptionChanged) {
      body.description = description;
    }

    const result = await client.patch<AdminRoleResponse, UpdateRoleBody>(rolePath(role.name), body);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onUpdated(
      result.data.role,
      isRename
        ? `Renamed ${role.name} to ${result.data.role.name} and moved its members with it.`
        : `Saved the description for ${result.data.role.name}.`,
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Role details</h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            void submit();
          }
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role-name">
            Name
          </label>
          <input
            id="role-name"
            className={inputField}
            type="text"
            value={name}
            autoComplete="off"
            disabled={system || submitting}
            aria-describedby="role-name-help"
            onChange={(event) => setName(event.target.value)}
          />
          <p id="role-name-help" className="mt-1 text-xs text-slate-500">
            {system
              ? SYSTEM_ROLE_REASON
              : 'Changing this renames the role and moves every member with it.'}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role-desc">
            Description
          </label>
          <input
            id="role-desc"
            className={inputField}
            type="text"
            value={description}
            autoComplete="off"
            disabled={submitting}
            aria-describedby="role-desc-help"
            onChange={(event) => setDescription(event.target.value)}
          />
          <p id="role-desc-help" className="mt-1 text-xs text-slate-500">
            The description is editable on system roles too; only the name is frozen.
          </p>
        </div>

        {isRename ? <WarningNote>{RENAME_WARNING}</WarningNote> : null}

        <button type="submit" className={buttonPrimary} disabled={!canSubmit}>
          {submitting ? 'Saving…' : 'Save details'}
        </button>
      </form>

      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The role was not updated." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
