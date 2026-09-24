import { useEffect, useState } from 'react';

import type { AdminRoleSuccessResponse, AddMemberBody } from '../roles/types';
import type { ApiClient, ApiError } from '../api';
import type { SelectedUser } from './types';

import {
  buttonPrimary,
  buttonSecondary,
  inputField,
  ErrorNote,
  InfoNote,
  Loading,
  SuccessNote,
  WarningNote,
} from '../ui';
import { OPENID_SYNC_WARNING, planRoleChange } from '../roles/system';
import { roleMembersPath, roleMemberPath } from '../roles/paths';
import { useRoleOptions } from '../roles/options';

interface RoleFormProps {
  client: ApiClient;
  user: SelectedUser;
  isSelf: boolean;
  onChanged: (role: string) => void;
}

/** What each refusal from the two membership routes means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API answers 400 for a malformed user id, for a user who does not hold the role being removed, and when the write would leave the deployment with no admin at all.',
  403: 'The API refuses direct membership writes on system roles other than ADMIN. USER is reached by removing the role the user holds today, never by assigning it.',
  404: 'Either the role or the user is gone. Reload this screen.',
};

const SELF_REASON =
  'This is your own account. Moving yourself off ADMIN takes away the admin access this panel runs on the moment it succeeds, and the only way back is editing the user document in MongoDB, so the control stays disabled here. Ask another admin to change your role.';

export const RoleForm = ({ client, user, isSelf, onChanged }: RoleFormProps) => {
  const current = user.role ?? '';
  const options = useRoleOptions(client);
  const [target, setTarget] = useState(current);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setTarget(current);
    setConfirming(false);
  }, [current]);

  const plan = planRoleChange(current, target);
  const canApply = !isSelf && !submitting && (plan.kind === 'assign' || plan.kind === 'revoke');
  const label = user.name || user.email || user.id;

  const names = options.state.status === 'ready' ? options.state.data.roles.map((r) => r.name) : [];
  const choices = current && !new Set(names).has(current) ? [current, ...names] : names;

  const submit = async (): Promise<void> => {
    if (plan.kind !== 'assign' && plan.kind !== 'revoke') {
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage('');

    const result =
      plan.kind === 'assign'
        ? await client.post<AdminRoleSuccessResponse, AddMemberBody>(roleMembersPath(plan.role), {
            userId: user.id,
          })
        : await client.remove<AdminRoleSuccessResponse>(roleMemberPath(plan.from, user.id));

    setSubmitting(false);
    setConfirming(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const applied = plan.kind === 'assign' ? plan.role : plan.to;
    setMessage(
      plan.kind === 'assign'
        ? `${label} now holds ${applied}. A user holds exactly one role, so this replaced ${current || 'the role they held'}.`
        : `${label} was moved out of ${plan.from} and back to ${applied}.`,
    );
    onChanged(applied);
  };

  const help = (): string => {
    if (isSelf) {
      return SELF_REASON;
    }
    if (plan.kind === 'noop') {
      return `${plan.role} is already this user's role, so there is nothing to send.`;
    }
    if (plan.kind === 'blocked') {
      return plan.reason;
    }
    if (plan.kind === 'assign') {
      return `Adds this user to ${plan.role}, which writes that role over the one they hold today.`;
    }
    return `Removes this user from ${plan.from}, which is how the API writes ${plan.to} back: it refuses a direct assignment of ${plan.to}.`;
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Role</h3>
      <p className="mb-3 text-sm text-slate-600">
        A user holds exactly one role, and it decides which features and admin capabilities they
        carry. Current role:{' '}
        <span className="font-medium text-slate-900">{current || 'unknown'}</span>.
      </p>

      {options.state.status === 'loading' ? <Loading label="Loading roles…" /> : null}
      {options.state.status === 'failed' ? (
        <div className="mb-3 space-y-2">
          <ErrorNote error={options.state.error} label="Could not load the roles." />
          <button type="button" className={buttonSecondary} onClick={options.reload}>
            Retry
          </button>
        </div>
      ) : null}

      {!current && options.state.status === 'ready' ? (
        <div className="mb-3">
          <InfoNote>
            This user was picked from search, which returns no role. Assigning a role still replaces
            whatever they hold; moving them to USER needs the role they hold today, so open them
            from the balances table for that.
          </InfoNote>
        </div>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canApply) {
            setConfirming(true);
          }
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="user-role">
            Role for this user
          </label>
          <select
            id="user-role"
            className={inputField}
            value={target}
            disabled={isSelf || submitting || options.state.status !== 'ready'}
            aria-describedby="user-role-help"
            onChange={(event) => {
              setTarget(event.target.value);
              setConfirming(false);
              setError(null);
              setMessage('');
            }}
          >
            {current ? null : <option value="">Pick a role</option>}
            {choices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p id="user-role-help" className="mt-1 text-xs text-slate-500" aria-live="polite">
            {help()}
          </p>
        </div>

        {confirming ? null : (
          <button type="submit" className={buttonPrimary} disabled={!canApply}>
            Change role
          </button>
        )}
      </form>

      {confirming && (plan.kind === 'assign' || plan.kind === 'revoke') ? (
        <div className="mt-3 space-y-2 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900" role="alert">
            This is a privilege change. {label} moves from{' '}
            <span className="font-medium">{current || 'their current role'}</span> to{' '}
            <span className="font-medium">{plan.kind === 'assign' ? plan.role : plan.to}</span>, and
            it takes effect on their next request.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonPrimary}
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Applying…' : 'Confirm role change'}
            </button>
            <button
              type="button"
              className={buttonSecondary}
              disabled={submitting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="mt-3">
          <SuccessNote>{message}</SuccessNote>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The role change was refused." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <WarningNote>{OPENID_SYNC_WARNING}</WarningNote>
      </div>
    </section>
  );
};
