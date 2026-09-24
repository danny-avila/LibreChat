import { useState } from 'react';

import type { AdminUserDeleteResponse, SelectedUser } from './types';
import type { ApiClient, ApiError } from '../api';

import { buttonDanger, inputField, ErrorNote } from '../ui';

interface OffboardFormProps {
  client: ApiClient;
  user: SelectedUser;
  isSelf: boolean;
  onDeleted: (message: string) => void;
}

/** What each refusal from `DELETE /api/admin/users/:id` means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API rejected the request. It answers 400 when the target is the last remaining admin, or when the user id is malformed.',
  403: 'The API answers 403 when an admin tries to delete their own account. Ask another admin to do it.',
  404: 'The API could not find that user. It may already have been deleted.',
  409: 'A deletion for this user is already running. Wait for it to finish, then reload this page.',
};

export const OffboardForm = ({ client, user, isSelf, onDeleted }: OffboardFormProps) => {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const target = user.email || user.id;
  const matches = confirmation.trim().toLowerCase() === target.toLowerCase();
  const canDelete = matches && !isSelf && !submitting;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const result = await client.remove<AdminUserDeleteResponse>(
      `/api/admin/users/${encodeURIComponent(user.id)}`,
    );
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirmation('');
    onDeleted(result.data.message);
  };

  return (
    <section className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-red-800">Offboard this user</h3>
      <p className="mb-3 text-sm text-slate-700">
        This deletes the user account and its owned configuration and permissions. It cannot be
        undone.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canDelete) {
            return;
          }
          void submit();
        }}
      >
        <div>
          <label
            className="mb-1 block text-sm font-medium text-slate-700"
            htmlFor="offboard-confirm"
          >
            Type <span className="font-mono">{target}</span> to confirm
          </label>
          <input
            id="offboard-confirm"
            className={inputField}
            type="text"
            value={confirmation}
            autoComplete="off"
            aria-describedby="offboard-confirm-help"
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <p id="offboard-confirm-help" className="mt-1 text-xs text-slate-500">
            {isSelf
              ? 'This is your own account, so the API will refuse the deletion. Another admin has to run it.'
              : 'The delete button stays disabled until this matches exactly.'}
          </p>
        </div>
        <button type="submit" className={buttonDanger} disabled={!canDelete}>
          {submitting ? 'Deleting…' : 'Delete user permanently'}
        </button>
      </form>
      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The deletion was refused." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
