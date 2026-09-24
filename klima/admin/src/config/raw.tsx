import { useState } from 'react';

import type { AdminConfigResponse, ConfigDocument, PrincipalRef, UpsertBody } from './types';
import type { ApiClient, ApiError } from '../api';
import type { JsonObject } from '../json';

import { buttonPrimary, buttonSecondary, inputField, ErrorNote, SuccessNote } from '../ui';
import { describeDropped, findBlockedSections, findDroppedKeys } from './sections';
import { parseJsonObject } from '../json';
import { configPath } from './paths';

interface RawEditorProps {
  client: ApiClient;
  principal: PrincipalRef;
  config: ConfigDocument | null;
  onSaved: (config: ConfigDocument | null) => void;
}

type Outcome =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'failed'; error: ApiError }
  | { status: 'saved'; message: string; dropped: string[] };

/** `DEFAULT_PRIORITY` in packages/api/src/admin/config.ts. */
const DEFAULT_PRIORITY = 10;

const toText = (config: ConfigDocument | null): string =>
  JSON.stringify(config?.overrides ?? {}, null, 2);

export const RawEditor = ({ client, principal, config, onSaved }: RawEditorProps) => {
  const [text, setText] = useState<string>(() => toText(config));
  const [priority, setPriority] = useState<string>(String(config?.priority ?? DEFAULT_PRIORITY));
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [formError, setFormError] = useState('');

  const parsed = parseJsonObject(text);
  const blocked = parsed.ok ? findBlockedSections(parsed.value) : [];
  const priorityValue = Number(priority.trim());
  const priorityValid = Number.isFinite(priorityValue) && priorityValue >= 0;

  const submit = async (): Promise<void> => {
    if (!parsed.ok) {
      setFormError('Fix the JSON before saving.');
      return;
    }
    if (blocked.length > 0) {
      setFormError('Remove the sections listed above before saving.');
      return;
    }
    if (!priorityValid) {
      setFormError('Priority must be a number of zero or more.');
      return;
    }

    setFormError('');
    setOutcome({ status: 'saving' });

    const sent: JsonObject = parsed.value;
    const result = await client.put<AdminConfigResponse, UpsertBody>(configPath(principal), {
      overrides: sent,
      priority: priorityValue,
    });

    if (!result.ok) {
      setOutcome({ status: 'failed', error: result.error });
      return;
    }

    const saved = result.data.config ?? null;
    const dropped = saved ? findDroppedKeys(sent, saved.overrides ?? {}) : Object.keys(sent);

    setOutcome({
      status: 'saved',
      message:
        result.data.message ??
        `Replaced the override for ${principal.label} with ${Object.keys(sent).length} section(s) at priority ${priorityValue}.`,
      dropped,
    });
    onSaved(saved);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Every other section (raw JSON)</h3>
      <p className="mb-3 text-sm text-slate-600">
        The escape hatch for <code>modelSpecs</code>, <code>rateLimits</code>,{' '}
        <code>interface</code>, <code>endpoints</code> and anything else librechat.yaml accepts.
        Saving here <span className="font-medium">replaces the whole override document</span>, so
        edit the text that is already loaded rather than starting from scratch — including the{' '}
        <code>balance</code> section the form above writes.
      </p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="raw-priority">
            Priority
          </label>
          <input
            id="raw-priority"
            className={`${inputField} max-w-[10rem]`}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={priority}
            aria-describedby="raw-priority-help"
            onChange={(event) => {
              setPriority(event.target.value);
              setFormError('');
            }}
          />
          <p id="raw-priority-help" className="mt-1 text-xs text-slate-500">
            Priority decides the merge order when several overrides cover the same person: the
            highest priority wins every field it sets. Give user overrides a higher number than
            group ones, and group higher than role, unless you want the opposite.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="raw-overrides">
            Overrides JSON
          </label>
          <textarea
            id="raw-overrides"
            className={`${inputField} min-h-[18rem] font-mono text-xs`}
            spellCheck={false}
            value={text}
            aria-describedby="raw-overrides-help"
            aria-invalid={!parsed.ok}
            onChange={(event) => {
              setText(event.target.value);
              setFormError('');
            }}
          />
          <p id="raw-overrides-help" className="mt-1 text-xs text-slate-500">
            Secret fields come back masked on read; saving a masked value leaves the stored secret
            untouched.
          </p>
        </div>

        {parsed.ok ? null : (
          <p
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <span className="font-semibold">That is not valid JSON.</span> {parsed.message}
          </p>
        )}

        {blocked.length > 0 ? (
          <div
            className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            role="alert"
          >
            <p className="font-semibold">These sections cannot go on a principal override:</p>
            <ul className="mt-1 list-disc pl-5">
              {blocked.map((entry) => (
                <li key={entry.section}>{entry.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {formError ? (
          <p className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={buttonPrimary}
            disabled={outcome.status === 'saving' || !parsed.ok || blocked.length > 0}
          >
            {outcome.status === 'saving' ? 'Saving…' : 'Replace overrides'}
          </button>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setText(toText(config));
              setPriority(String(config?.priority ?? DEFAULT_PRIORITY));
              setFormError('');
            }}
          >
            Reset to stored
          </button>
        </div>
      </form>

      {outcome.status === 'failed' ? (
        <div className="mt-3">
          <ErrorNote error={outcome.error} label="The replace was refused." />
        </div>
      ) : null}
      {outcome.status === 'saved' ? (
        <div className="mt-3 space-y-2">
          <SuccessNote>{outcome.message}</SuccessNote>
          {outcome.dropped.length > 0 ? (
            <p
              className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="alert"
            >
              {describeDropped(outcome.dropped)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
