import { useMemo, useState } from 'react';

import type { RefillIntervalUnit } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type {
  AdminConfigResponse,
  BalanceOverride,
  ConfigDocument,
  FieldEntry,
  PatchFieldsBody,
  PrincipalRef,
} from './types';
import type { ApiClient, ApiError } from '../api';
import type { JsonObject } from '../json';

import {
  buttonPrimary,
  buttonSecondary,
  inputField,
  ErrorNote,
  InfoNote,
  SuccessNote,
} from '../ui';
import { creditsToDollars, dollarsToCredits, formatCredits, formatDollars } from '../credits';
import { describeDropped, findDroppedPaths } from './sections';
import { configPath } from './paths';

interface BudgetFormProps {
  client: ApiClient;
  principal: PrincipalRef;
  config: ConfigDocument | null;
  onSaved: (config: ConfigDocument | null) => void;
}

type BudgetKey = keyof BalanceOverride;

interface BudgetState {
  enabled: boolean;
  startBalance: string;
  autoRefillEnabled: boolean;
  refillAmount: string;
  refillIntervalValue: string;
  refillIntervalUnit: RefillIntervalUnit;
  overridden: Record<BudgetKey, boolean>;
}

type Outcome =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'failed'; error: ApiError }
  | { status: 'saved'; message: string; dropped: string[] };

/** Mirrors `REFILL_INTERVAL_UNITS` (packages/data-provider/src/balance.ts:1). */
const REFILL_UNITS: readonly RefillIntervalUnit[] = [
  'seconds',
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
];

const BUDGET_KEYS: readonly BudgetKey[] = [
  'enabled',
  'startBalance',
  'autoRefillEnabled',
  'refillAmount',
  'refillIntervalValue',
  'refillIntervalUnit',
];

const MONTHLY_PRESETS = [20, 50, 80, 200];

const noOverrides: Record<BudgetKey, boolean> = {
  enabled: false,
  startBalance: false,
  autoRefillEnabled: false,
  refillAmount: false,
  refillIntervalValue: false,
  refillIntervalUnit: false,
};

const creditsToInput = (credits: number | undefined): string =>
  credits == null ? '' : String(creditsToDollars(credits));

const readBalance = (config: ConfigDocument | null): BalanceOverride => {
  const section = config?.overrides?.balance;
  if (section == null || typeof section !== 'object' || Array.isArray(section)) {
    return {};
  }
  return section as BalanceOverride;
};

const toState = (config: ConfigDocument | null): BudgetState => {
  const balance = readBalance(config);
  return {
    enabled: balance.enabled ?? true,
    startBalance: creditsToInput(balance.startBalance),
    autoRefillEnabled: balance.autoRefillEnabled ?? true,
    refillAmount: creditsToInput(balance.refillAmount),
    refillIntervalValue:
      balance.refillIntervalValue == null ? '' : String(balance.refillIntervalValue),
    refillIntervalUnit: balance.refillIntervalUnit ?? 'months',
    overridden: {
      enabled: balance.enabled !== undefined,
      startBalance: balance.startBalance !== undefined,
      autoRefillEnabled: balance.autoRefillEnabled !== undefined,
      refillAmount: balance.refillAmount !== undefined,
      refillIntervalValue: balance.refillIntervalValue !== undefined,
      refillIntervalUnit: balance.refillIntervalUnit !== undefined,
    },
  };
};

const parseDollars = (raw: string): number | null => {
  const dollars = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(dollars) || dollars < 0) {
    return null;
  }
  return dollarsToCredits(dollars);
};

const parseCount = (raw: string): number | null => {
  const count = Number(raw.trim());
  if (!raw.trim() || !Number.isInteger(count) || count < 1) {
    return null;
  }
  return count;
};

const collectErrors = (state: BudgetState): Partial<Record<BudgetKey, string>> => {
  const errors: Partial<Record<BudgetKey, string>> = {};
  if (state.overridden.startBalance && parseDollars(state.startBalance) === null) {
    errors.startBalance = 'Enter a dollar amount of zero or more, for example 80.';
  }
  if (state.overridden.refillAmount && parseDollars(state.refillAmount) === null) {
    errors.refillAmount = 'Enter a dollar amount of zero or more, for example 80.';
  }
  if (state.overridden.refillIntervalValue && parseCount(state.refillIntervalValue) === null) {
    errors.refillIntervalValue = 'Enter a whole number of one or more.';
  }
  return errors;
};

const collectEntries = (state: BudgetState): FieldEntry[] => {
  const entries: FieldEntry[] = [];
  if (state.overridden.enabled) {
    entries.push({ fieldPath: 'balance.enabled', value: state.enabled });
  }
  if (state.overridden.startBalance) {
    entries.push({
      fieldPath: 'balance.startBalance',
      value: parseDollars(state.startBalance) ?? 0,
    });
  }
  if (state.overridden.autoRefillEnabled) {
    entries.push({ fieldPath: 'balance.autoRefillEnabled', value: state.autoRefillEnabled });
  }
  if (state.overridden.refillAmount) {
    entries.push({
      fieldPath: 'balance.refillAmount',
      value: parseDollars(state.refillAmount) ?? 0,
    });
  }
  if (state.overridden.refillIntervalValue) {
    entries.push({
      fieldPath: 'balance.refillIntervalValue',
      value: parseCount(state.refillIntervalValue) ?? 1,
    });
  }
  if (state.overridden.refillIntervalUnit) {
    entries.push({ fieldPath: 'balance.refillIntervalUnit', value: state.refillIntervalUnit });
  }
  return entries;
};

/** Fields the stored document still carries but the form no longer overrides. */
const collectRemovals = (state: BudgetState, stored: BalanceOverride): string[] =>
  BUDGET_KEYS.filter((key) => stored[key] !== undefined && !state.overridden[key]).map(
    (key) => `balance.${key}`,
  );

const FieldShell = ({
  id,
  label,
  overridden,
  onToggle,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  overridden: boolean;
  onToggle: (next: boolean) => void;
  help?: string;
  error?: string;
  children: ReactNode;
}) => (
  <div className="rounded border border-slate-200 p-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={overridden} onChange={(e) => onToggle(e.target.checked)} />
        Override
      </label>
    </div>
    <div className={overridden ? '' : 'opacity-50'}>{children}</div>
    {help ? (
      <p className="mt-1 text-xs text-slate-500" id={`${id}-help`}>
        {help}
      </p>
    ) : null}
    {error ? (
      <p className="mt-1 text-xs text-red-700" role="alert">
        {error}
      </p>
    ) : null}
  </div>
);

export const BudgetForm = ({ client, principal, config, onSaved }: BudgetFormProps) => {
  const stored = useMemo(() => readBalance(config), [config]);
  const [state, setState] = useState<BudgetState>(() => toState(config));
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [formError, setFormError] = useState('');

  const errors = collectErrors(state);
  const entries = collectEntries(state);
  const removals = collectRemovals(state, stored);

  const update = (patch: Partial<BudgetState>): void => {
    setState((current) => ({ ...current, ...patch }));
    setFormError('');
  };

  const toggle = (key: BudgetKey, next: boolean): void => {
    setState((current) => ({ ...current, overridden: { ...current.overridden, [key]: next } }));
    setFormError('');
  };

  const applyMonthlyPreset = (dollars: number): void => {
    setState({
      enabled: true,
      startBalance: String(dollars),
      autoRefillEnabled: true,
      refillAmount: String(dollars),
      refillIntervalValue: '1',
      refillIntervalUnit: 'months',
      overridden: {
        enabled: true,
        startBalance: true,
        autoRefillEnabled: true,
        refillAmount: true,
        refillIntervalValue: true,
        refillIntervalUnit: true,
      },
    });
    setFormError('');
  };

  const clearAll = (): void => {
    setState((current) => ({ ...current, overridden: { ...noOverrides } }));
    setFormError('');
  };

  const submit = async (): Promise<void> => {
    if (Object.keys(errors).length > 0) {
      setFormError('Fix the highlighted fields before saving.');
      return;
    }
    if (entries.length === 0 && removals.length === 0) {
      setFormError('Nothing to save: tick "Override" on the fields this principal should set.');
      return;
    }

    setOutcome({ status: 'saving' });

    let latest: ConfigDocument | null = config;

    for (const fieldPath of removals) {
      const result = await client.remove<AdminConfigResponse>(
        `${configPath(principal)}/fields?fieldPath=${encodeURIComponent(fieldPath)}`,
      );
      if (!result.ok) {
        setOutcome({ status: 'failed', error: result.error });
        return;
      }
      latest = result.data.config ?? latest;
    }

    if (entries.length === 0) {
      setOutcome({
        status: 'saved',
        message: `Removed ${removals.length} balance field(s) from this override.`,
        dropped: [],
      });
      onSaved(latest);
      return;
    }

    const result = await client.patch<AdminConfigResponse, PatchFieldsBody>(
      `${configPath(principal)}/fields`,
      { entries },
    );

    if (!result.ok) {
      setOutcome({ status: 'failed', error: result.error });
      return;
    }

    const saved = result.data.config ?? null;
    const overrides: JsonObject = saved?.overrides ?? {};
    const dropped = saved ? findDroppedPaths(entries, overrides) : entries.map((e) => e.fieldPath);

    setOutcome({
      status: 'saved',
      message: result.data.message
        ? result.data.message
        : `Saved ${entries.length} balance field(s)${removals.length ? `, removed ${removals.length}` : ''}.`,
      dropped,
    });
    onSaved(saved ?? latest);
  };

  const startCredits = parseDollars(state.startBalance);
  const refillCredits = parseDollars(state.refillAmount);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Budget</h3>
      <p className="mb-3 text-sm text-slate-600">
        The most common change: give <span className="font-medium">{principal.label}</span> a
        monthly allowance. Pick an amount, review the fields, then save.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-700">Monthly allowance:</span>
        {MONTHLY_PRESETS.map((dollars) => (
          <button
            key={dollars}
            type="button"
            className={buttonSecondary}
            onClick={() => applyMonthlyPreset(dollars)}
          >
            ${dollars}/month
          </button>
        ))}
        <button type="button" className={buttonSecondary} onClick={clearAll}>
          Override nothing
        </button>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldShell
          id="budget-enabled"
          label="Balance enforcement"
          overridden={state.overridden.enabled}
          onToggle={(next) => toggle('enabled', next)}
          help="Off means this principal is never blocked by a balance, whatever the numbers below say."
        >
          <select
            id="budget-enabled"
            className={inputField}
            disabled={!state.overridden.enabled}
            value={state.enabled ? 'on' : 'off'}
            onChange={(event) => update({ enabled: event.target.value === 'on' })}
          >
            <option value="on">Enforce balances</option>
            <option value="off">Do not enforce balances</option>
          </select>
        </FieldShell>

        <FieldShell
          id="budget-start"
          label="Starting balance (US dollars)"
          overridden={state.overridden.startBalance}
          onToggle={(next) => toggle('startBalance', next)}
          error={errors.startBalance}
          help="Seeds a user who has no balance record yet. It never tops up somebody who already has one, so raising it does not give existing users more credits — use Users & balances for that."
        >
          <input
            id="budget-start"
            className={inputField}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            disabled={!state.overridden.startBalance}
            value={state.startBalance}
            onChange={(event) => update({ startBalance: event.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500" aria-live="polite">
            {startCredits === null
              ? 'Stored as token credits; this form converts the dollars you type.'
              : `Stored as ${formatCredits(startCredits)} (${formatDollars(startCredits)}).`}
          </p>
        </FieldShell>

        <FieldShell
          id="budget-autorefill"
          label="Automatic refill"
          overridden={state.overridden.autoRefillEnabled}
          onToggle={(next) => toggle('autoRefillEnabled', next)}
          help="A refill needs all four of: automatic refill on, an amount, an interval value and an interval unit. Any one missing and no refill happens."
        >
          <select
            id="budget-autorefill"
            className={inputField}
            disabled={!state.overridden.autoRefillEnabled}
            value={state.autoRefillEnabled ? 'on' : 'off'}
            onChange={(event) => update({ autoRefillEnabled: event.target.value === 'on' })}
          >
            <option value="on">Refill automatically</option>
            <option value="off">No automatic refill</option>
          </select>
        </FieldShell>

        <FieldShell
          id="budget-refill-amount"
          label="Refill amount (US dollars)"
          overridden={state.overridden.refillAmount}
          onToggle={(next) => toggle('refillAmount', next)}
          error={errors.refillAmount}
        >
          <input
            id="budget-refill-amount"
            className={inputField}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            disabled={!state.overridden.refillAmount}
            value={state.refillAmount}
            onChange={(event) => update({ refillAmount: event.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500" aria-live="polite">
            {refillCredits === null
              ? 'Stored as token credits; this form converts the dollars you type.'
              : `Stored as ${formatCredits(refillCredits)} (${formatDollars(refillCredits)}).`}
          </p>
        </FieldShell>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldShell
            id="budget-interval-value"
            label="Refill every"
            overridden={state.overridden.refillIntervalValue}
            onToggle={(next) => toggle('refillIntervalValue', next)}
            error={errors.refillIntervalValue}
          >
            <input
              id="budget-interval-value"
              className={inputField}
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              disabled={!state.overridden.refillIntervalValue}
              value={state.refillIntervalValue}
              onChange={(event) => update({ refillIntervalValue: event.target.value })}
            />
          </FieldShell>

          <FieldShell
            id="budget-interval-unit"
            label="Interval unit"
            overridden={state.overridden.refillIntervalUnit}
            onToggle={(next) => toggle('refillIntervalUnit', next)}
          >
            <select
              id="budget-interval-unit"
              className={inputField}
              disabled={!state.overridden.refillIntervalUnit}
              value={state.refillIntervalUnit}
              onChange={(event) =>
                update({ refillIntervalUnit: event.target.value as RefillIntervalUnit })
              }
            >
              {REFILL_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </FieldShell>
        </div>

        {removals.length > 0 ? (
          <InfoNote>
            Saving also removes {removals.join(', ')} from this override, so those fall back to the
            next principal in the merge order.
          </InfoNote>
        ) : null}

        {formError ? (
          <p className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}

        <button type="submit" className={buttonPrimary} disabled={outcome.status === 'saving'}>
          {outcome.status === 'saving' ? 'Saving…' : 'Save budget'}
        </button>
      </form>

      {outcome.status === 'failed' ? (
        <div className="mt-3">
          <ErrorNote error={outcome.error} label="The budget change was refused." />
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
