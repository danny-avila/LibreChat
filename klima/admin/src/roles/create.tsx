import { useState } from 'react';

import type { AdminRoleResponse, AdminRoleDetail, CreateRoleBody } from './types';
import type { ApiClient, ApiError } from '../api';

import { buttonPrimary, inputField, ErrorNote } from '../ui';
import { rolesRootPath } from './paths';
import { isSystemRole } from './system';

interface CreateRoleFormProps {
  client: ApiClient;
  onCreated: (role: AdminRoleDetail, message: string) => void;
}

/** What each refusal from `POST /api/admin/roles` means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API rejected the name or the description. A name is required, stops at 500 characters, carries no control characters, and cannot be “members” or “permissions” — those are reserved path segments on the roles routes.',
  403: 'Your role does not carry the `manage:roles` capability that creating a role needs.',
  409: 'A role with that name already exists. Open it from the list above instead of creating a second one.',
};

const CONFLICT = 409;

export const CreateRoleForm = ({ client, onCreated }: CreateRoleFormProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const trimmed = name.trim();
  const clashesWithSystemRole = trimmed !== '' && isSystemRole(trimmed);
  const canSubmit = trimmed !== '' && !clashesWithSystemRole && !submitting;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);

    const body: CreateRoleBody = { name: trimmed };
    const trimmedDescription = description.trim();
    if (trimmedDescription) {
      body.description = trimmedDescription;
    }

    const result = await client.post<AdminRoleResponse, CreateRoleBody>(rolesRootPath(), body);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setName('');
    setDescription('');
    onCreated(
      result.data.role,
      `Created the role ${result.data.role.name}. It holds no permissions yet — grant them below.`,
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Create a role</h2>
      <p className="mb-3 text-sm text-slate-600">
        A new role starts with no permissions and no members. Create it, grant it what it needs, and
        then add people to it.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            void submit();
          }
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role-new-name">
            Name
          </label>
          <input
            id="role-new-name"
            className={inputField}
            type="text"
            value={name}
            autoComplete="off"
            aria-describedby="role-new-name-help"
            onChange={(event) => setName(event.target.value)}
          />
          <p id="role-new-name-help" className="mt-1 text-xs text-slate-500">
            Role names are matched exactly everywhere else in LibreChat, so uppercase names such as
            BUILDER read best.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="role-new-desc">
            Description <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="role-new-desc"
            className={inputField}
            type="text"
            value={description}
            autoComplete="off"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {clashesWithSystemRole ? (
          <p className="text-sm text-amber-900" role="alert">
            ADMIN and USER already exist as system roles. Pick another name.
          </p>
        ) : null}

        <button type="submit" className={buttonPrimary} disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create role'}
        </button>
      </form>

      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote
            error={error}
            label={
              error.status === CONFLICT ? 'That role already exists.' : 'The role was not created.'
            }
          />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
