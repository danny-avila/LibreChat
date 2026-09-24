import { useState } from 'react';

import type { TAdminBalanceTopUpResponse, TAdminBalance } from 'librechat-data-provider';
import type { ApiClient, ApiError } from '../api';
import type { SelectedUser } from './types';

import { buttonPrimary, buttonSecondary, inputField, ErrorNote, SuccessNote } from '../ui';
import { dollarsToCredits, formatCredits, formatDollars } from '../credits';

interface TopUpFormProps {
  client: ApiClient;
  user: SelectedUser;
  onApplied: (balance: TAdminBalance) => void;
}

type Outcome =
  | { status: 'idle' }
  | { status: 'failed'; error: ApiError }
  | { status: 'applied'; response: TAdminBalanceTopUpResponse };

type ParsedAmount = { ok: true; credits: number } | { ok: false; message: string };

const QUICK_DOLLAR_AMOUNTS = [5, 10, 25, 50];

const MAX_REASON_LENGTH = 500;

const parseAmount = (raw: string): ParsedAmount => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: 'Enter an amount in US dollars.' };
  }
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars)) {
    return { ok: false, message: 'Enter a number, for example 10 or -2.50.' };
  }
  const credits = dollarsToCredits(dollars);
  if (credits === 0) {
    return { ok: false, message: 'Enter an amount that moves the balance by at least one credit.' };
  }
  return { ok: true, credits };
};

export const TopUpForm = ({ client, user, onApplied }: TopUpFormProps) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });

  const parsed = parseAmount(amount);

  const submit = async (): Promise<void> => {
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError('');
    setSubmitting(true);
    const result = await client.post<
      TAdminBalanceTopUpResponse,
      { credits: number; reason?: string }
    >(`/api/admin/users/${encodeURIComponent(user.id)}/balance`, {
      credits: parsed.credits,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSubmitting(false);

    if (!result.ok) {
      setOutcome({ status: 'failed', error: result.error });
      return;
    }

    setOutcome({ status: 'applied', response: result.data });
    setAmount('');
    setReason('');
    onApplied(result.data.balance);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Add or remove credits</h3>
      <p className="mb-3 text-sm text-slate-600">
        A user blocked by an empty balance is unblocked here: add dollars and they can chat again. A
        negative amount takes credits back.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="topup-amount">
            Amount in US dollars
          </label>
          <input
            id="topup-amount"
            className={inputField}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            aria-describedby="topup-amount-help"
            onChange={(event) => {
              setAmount(event.target.value);
              setFormError('');
            }}
          />
          <p id="topup-amount-help" className="mt-1 text-xs text-slate-500" aria-live="polite">
            {parsed.ok
              ? `Sends ${formatCredits(parsed.credits)} (${formatDollars(parsed.credits)}).`
              : 'The API takes credits; this form converts the dollars you type.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_DOLLAR_AMOUNTS.map((dollars) => (
            <button
              key={dollars}
              type="button"
              className={buttonSecondary}
              onClick={() => {
                setAmount(String(dollars));
                setFormError('');
              }}
            >
              +${dollars}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="topup-reason">
            Reason (optional, recorded in the audit log)
          </label>
          <input
            id="topup-reason"
            className={inputField}
            type="text"
            maxLength={MAX_REASON_LENGTH}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {formError ? (
          <p className="text-sm text-red-700" role="alert">
            {formError}
          </p>
        ) : null}
        <button type="submit" className={buttonPrimary} disabled={submitting}>
          {submitting ? 'Applying…' : 'Apply to balance'}
        </button>
      </form>
      {outcome.status === 'failed' ? (
        <div className="mt-3">
          <ErrorNote error={outcome.error} label="The balance change was refused." />
        </div>
      ) : null}
      {outcome.status === 'applied' ? (
        <div className="mt-3">
          <SuccessNote>
            Applied {formatDollars(outcome.response.credits)} (
            {formatCredits(outcome.response.credits)}). New balance:{' '}
            <strong>{formatDollars(outcome.response.balance.tokenCredits)}</strong> —{' '}
            {formatCredits(outcome.response.balance.tokenCredits)}.
          </SuccessNote>
        </div>
      ) : null}
    </section>
  );
};
