import { useState } from 'react';

import type {
  AdminConfigDeleteResponse,
  AdminConfigResponse,
  ConfigDocument,
  PrincipalRef,
  ToggleActiveBody,
} from './types';
import type { ApiClient, ApiError } from '../api';

import { buttonDanger, buttonSecondary, inputField, ErrorNote, SuccessNote } from '../ui';
import { configPath } from './paths';

interface DocumentActionsProps {
  client: ApiClient;
  principal: PrincipalRef;
  config: ConfigDocument;
  onToggled: (config: ConfigDocument | null) => void;
  onDeleted: (message: string) => void;
}

/** What each refusal from the config mutation routes means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API rejected the request shape. Check the principal kind and the payload.',
  403: 'Your role does not carry the config capability this write needs. Broad `manage:configs` is required to touch the tenant base document or to change priority.',
  404: 'There is no stored override for this principal any more. Reload the list.',
};

export const DocumentActions = ({
  client,
  principal,
  config,
  onToggled,
  onDeleted,
}: DocumentActionsProps) => {
  const [confirmation, setConfirmation] = useState('');
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState('');

  const matches = confirmation.trim() === principal.id;
  const toggleLabel = config.isActive ? 'Disable this override' : 'Enable this override';

  const toggle = async (): Promise<void> => {
    setToggling(true);
    setError(null);
    setMessage('');
    const result = await client.patch<AdminConfigResponse, ToggleActiveBody>(
      `${configPath(principal)}/active`,
      { isActive: !config.isActive },
    );
    setToggling(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const saved = result.data.config ?? null;
    setMessage(
      saved?.isActive
        ? 'The override is active again and merges into this principal’s config.'
        : 'The override is disabled. It stays stored but no longer merges into anyone’s config.',
    );
    onToggled(saved);
  };

  const remove = async (): Promise<void> => {
    setDeleting(true);
    setError(null);
    setMessage('');
    const result = await client.remove<AdminConfigDeleteResponse>(configPath(principal));
    setDeleting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirmation('');
    onDeleted(
      `Deleted the config override for ${principal.label}. They fall back to the tenant base config.`,
    );
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">This override document</h3>
      <dl className="mb-3 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="text-slate-500">Priority</dt>
          <dd className="font-medium">{config.priority}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-500">Status</dt>
          <dd className="font-medium">{config.isActive ? 'Active' : 'Disabled'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-500">Version</dt>
          <dd className="font-medium">{config.configVersion}</dd>
        </div>
      </dl>

      <button
        type="button"
        className={buttonSecondary}
        disabled={toggling}
        onClick={() => void toggle()}
      >
        {toggling ? 'Applying…' : toggleLabel}
      </button>

      <form
        className="mt-4 space-y-2 border-t border-slate-200 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (matches && !deleting) {
            void remove();
          }
        }}
      >
        <label className="block text-sm font-medium text-slate-700" htmlFor="config-delete-confirm">
          Type <span className="font-mono">{principal.id}</span> to delete the whole override
        </label>
        <input
          id="config-delete-confirm"
          className={inputField}
          type="text"
          value={confirmation}
          autoComplete="off"
          aria-describedby="config-delete-help"
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <p id="config-delete-help" className="text-xs text-slate-500">
          Deleting removes every section at once, budget included. Disable it instead if you only
          want to pause it.
        </p>
        <button type="submit" className={buttonDanger} disabled={!matches || deleting}>
          {deleting ? 'Deleting…' : 'Delete override'}
        </button>
      </form>

      {message ? (
        <div className="mt-3">
          <SuccessNote>{message}</SuccessNote>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The request was refused." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
