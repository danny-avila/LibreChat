import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminConfigResponse, ConfigDocument, PrincipalRef } from './types';
import type { ApiClient, RemoteState } from '../api';

import { buttonSecondary, ErrorNote, InfoNote, Loading } from '../ui';
import { BASE_PRINCIPAL_ID } from './sections';
import { DocumentActions } from './actions';
import { BudgetForm } from './budget';
import { RawEditor } from './raw';

interface ConfigEditorProps {
  client: ApiClient;
  principal: PrincipalRef;
  onChanged: () => void;
  onDeleted: (message: string) => void;
  onClose: () => void;
}

/** A 404 from the config endpoint means "no override yet", not a failure. */
type EditorState = RemoteState<ConfigDocument> | { status: 'missing' };

const NOT_FOUND = 404;

export const ConfigEditor = ({
  client,
  principal,
  onChanged,
  onDeleted,
  onClose,
}: ConfigEditorProps) => {
  const [state, setState] = useState<EditorState>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState({ status: 'loading' });

    const result = await client.get<AdminConfigResponse>(
      `/api/admin/config/${encodeURIComponent(principal.kind)}/${encodeURIComponent(principal.id)}`,
    );
    if (id !== requestId.current) {
      return;
    }
    if (result.ok) {
      setState(
        result.data.config ? { status: 'ready', data: result.data.config } : { status: 'missing' },
      );
      return;
    }
    if (result.error.status === NOT_FOUND) {
      setState({ status: 'missing' });
      return;
    }
    setState({ status: 'failed', error: result.error });
  }, [client, principal.id, principal.kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = (config: ConfigDocument | null): void => {
    requestId.current += 1;
    setState(config ? { status: 'ready', data: config } : { status: 'missing' });
    onChanged();
  };

  const config = state.status === 'ready' ? state.data : null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {principal.id === BASE_PRINCIPAL_ID ? 'Tenant base config' : principal.label}
            </h2>
            <p className="text-sm text-slate-600">
              {principal.kind} · {principal.id}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonSecondary} onClick={() => void load()}>
              Reload
            </button>
            <button type="button" className={buttonSecondary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {state.status === 'loading' ? <Loading label="Loading this override…" /> : null}
        {state.status === 'failed' ? (
          <div className="mt-3">
            <ErrorNote error={state.error} label="Could not load this override." />
          </div>
        ) : null}
        {state.status === 'missing' ? (
          <div className="mt-3">
            <InfoNote>
              No override stored for this principal yet. Saving below creates one — everything you
              do not set keeps coming from librechat.yaml and the tenant base config.
            </InfoNote>
          </div>
        ) : null}
        {principal.id === BASE_PRINCIPAL_ID ? (
          <div className="mt-3">
            <InfoNote>
              This is the tenant-wide base document. Every change here reaches every user, and only
              a role with broad <code>manage:configs</code> may write it.
            </InfoNote>
          </div>
        ) : null}
      </section>

      {state.status === 'loading' || state.status === 'failed' ? null : (
        <>
          <BudgetForm
            key={`budget-${principal.kind}-${principal.id}`}
            client={client}
            principal={principal}
            config={config}
            onSaved={handleSaved}
          />
          <RawEditor
            key={`raw-${principal.kind}-${principal.id}`}
            client={client}
            principal={principal}
            config={config}
            onSaved={handleSaved}
          />
          {config ? (
            <DocumentActions
              client={client}
              principal={principal}
              config={config}
              onToggled={handleSaved}
              onDeleted={(message) => {
                requestId.current += 1;
                setState({ status: 'missing' });
                onDeleted(message);
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
};
