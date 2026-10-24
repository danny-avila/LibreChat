import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, CREDITS_PER_USD } from 'librechat-data-provider';
import {
  Button,
  Input,
  Progress,
  Skeleton,
  Slider,
  Switch,
  useToastContext,
} from '@librechat/client';
import type { BalanceDisplay } from 'librechat-data-provider';
import type { ChangeEvent } from 'react';
import { useGetStartupConfig, useUpdatePersonalSpendLimitMutation } from '~/data-provider';
import useBalanceSummary from '~/hooks/useBalanceSummary';
import { formatBalanceAmount } from '~/utils';
import { useLocalize } from '~/hooks';

type LimitError = 'required' | 'not_a_number' | 'negative' | 'too_large' | 'not_integer' | null;

/**
 * Personal cap for the current balance cannot exceed the admin-assigned allotment (`startBalance`).
 * Falls back to current token credits when start balance is unavailable.
 */
function assignedCreditLimit(params: { startBalance?: number; tokenCredits: number }): number {
  if (
    typeof params.startBalance === 'number' &&
    Number.isFinite(params.startBalance) &&
    params.startBalance >= 0
  ) {
    return params.startBalance;
  }
  return Math.max(0, params.tokenCredits);
}

function creditsToInput(credits: number, display: BalanceDisplay): number {
  if (display === 'currency') {
    return credits / CREDITS_PER_USD;
  }
  return credits;
}

function inputToCredits(value: number, display: BalanceDisplay): number {
  if (display === 'currency') {
    return value * CREDITS_PER_USD;
  }
  return value;
}

function validateLimitCredits(
  credits: number | null,
  { max, requireValue }: { max: number; requireValue: boolean },
): LimitError {
  if (credits == null) {
    return requireValue ? 'required' : null;
  }
  if (!Number.isFinite(credits)) {
    return 'not_a_number';
  }
  if (credits < 0) {
    return 'negative';
  }
  if (credits > max) {
    return 'too_large';
  }
  if (!Number.isInteger(credits)) {
    return 'not_integer';
  }
  return null;
}

function clampCredits(credits: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(credits)));
}

export default function PersonalSpendLimit() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const { state, currency, balance } = useBalanceSummary();
  const [enabled, setEnabled] = useState(false);
  const [limitDraft, setLimitDraft] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  const mutation = useUpdatePersonalSpendLimitMutation({
    onSuccess: () =>
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' }),
    onError: () => {
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
      void queryClient.invalidateQueries([QueryKeys.balance]);
    },
  });

  useEffect(() => {
    if (balance == null) {
      return;
    }
    setEnabled(balance.personalSpendEnabled === true);
    setLimitDraft(
      typeof balance.personalSpendLimit === 'number' && Number.isFinite(balance.personalSpendLimit)
        ? balance.personalSpendLimit
        : null,
    );
    setTouched(false);
  }, [balance]);

  const display: BalanceDisplay = state.status === 'success' ? state.summary.display : 'credits';
  /** Limit is always edited in credits (or currency equivalent); percent mode has no mapping */
  const editDisplay: BalanceDisplay = display === 'percent' ? 'credits' : display;
  const used = Math.max(0, balance?.personalSpendUsed ?? 0);
  const savedLimit =
    typeof balance?.personalSpendLimit === 'number' && Number.isFinite(balance.personalSpendLimit)
      ? balance.personalSpendLimit
      : null;

  const maxCredits = useMemo(
    () =>
      assignedCreditLimit({
        startBalance: startupConfig?.balance?.startBalance,
        tokenCredits: balance?.tokenCredits ?? 0,
      }),
    [balance?.tokenCredits, startupConfig?.balance?.startBalance],
  );

  const maxInput = creditsToInput(maxCredits, editDisplay);
  const inputStep = editDisplay === 'currency' ? 0.01 : 1;
  const draftError = validateLimitCredits(limitDraft, {
    max: maxCredits,
    requireValue: enabled,
  });
  const showError = touched && draftError != null;

  if (state.status === 'loading') {
    return (
      <div className="space-y-2" aria-busy="true" data-testid="personal-spend-loading">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (state.status === 'error' || balance == null) {
    return (
      <div className="text-text-destructive text-sm" role="alert">
        {localize('com_nav_balance_personal_spend_error')}
      </div>
    );
  }

  let usedPercent = 0;
  if (limitDraft != null && limitDraft > 0) {
    usedPercent = Math.min(100, Math.floor((used / limitDraft) * 100));
  } else if (limitDraft === 0 && used > 0) {
    usedPercent = 100;
  }

  let progressVariant: 'default' | 'warning' | 'error' = 'default';
  if (usedPercent >= 100) {
    progressVariant = 'error';
  } else if (usedPercent >= 90) {
    progressVariant = 'warning';
  }

  const onToggle = (checked: boolean) => {
    setEnabled(checked);
    setTouched(true);
    if (checked && limitDraft == null) {
      /** Turning on without a limit yet — keep toggle local until a valid limit is saved with it */
      return;
    }
    if (checked) {
      const error = validateLimitCredits(limitDraft, { max: maxCredits, requireValue: true });
      if (error != null || limitDraft == null) {
        return;
      }
      mutation.mutate({
        personalSpendEnabled: true,
        personalSpendLimit: clampCredits(limitDraft, maxCredits),
      });
      return;
    }
    mutation.mutate({ personalSpendEnabled: false });
  };

  const setDraftFromCredits = (credits: number | null) => {
    setTouched(true);
    if (credits == null || !Number.isFinite(credits)) {
      setLimitDraft(null);
      return;
    }
    setLimitDraft(clampCredits(credits, maxCredits));
  };

  const onSliderChange = (value: number[]) => {
    setDraftFromCredits(inputToCredits(value[0] ?? 0, editDisplay));
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const raw = event.target.value.trim();
    if (raw === '') {
      setLimitDraft(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setLimitDraft(null);
      return;
    }
    setDraftFromCredits(inputToCredits(parsed, editDisplay));
  };

  const onSaveLimit = () => {
    setTouched(true);
    const error = validateLimitCredits(limitDraft, { max: maxCredits, requireValue: true });
    if (error != null || limitDraft == null) {
      showToast({
        message: localize(errorMessageKey(error ?? 'required')),
        status: 'error',
      });
      return;
    }
    const credits = clampCredits(limitDraft, maxCredits);
    setLimitDraft(credits);
    mutation.mutate({
      personalSpendEnabled: enabled,
      personalSpendLimit: credits,
    });
  };

  const onClearLimit = () => {
    setTouched(false);
    setLimitDraft(null);
    mutation.mutate({ personalSpendEnabled: false, personalSpendLimit: null });
    setEnabled(false);
  };

  const inputValue = limitDraft == null ? undefined : creditsToInput(limitDraft, editDisplay);

  return (
    <div className="space-y-3" data-testid="personal-spend-limit">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div id="personal-spend-enabled-label">
            {localize('com_nav_balance_personal_spend_enable')}
          </div>
          <div id="personal-spend-enabled-description" className="text-text-secondary mt-1 text-xs">
            {localize('com_nav_balance_personal_spend_enable_description')}
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={mutation.isLoading}
          aria-labelledby="personal-spend-enabled-label"
          aria-describedby="personal-spend-enabled-description"
        />
      </div>

      {enabled && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-secondary" data-testid="personal-spend-used">
                {localize('com_nav_balance_personal_spend_used', {
                  0: formatBalanceAmount(used, editDisplay, currency),
                })}
              </span>
              {limitDraft != null && (
                <span className="text-text-secondary" data-testid="personal-spend-range">
                  {localize('com_nav_balance_personal_spend_range', {
                    0: formatBalanceAmount(used, editDisplay, currency),
                    1: formatBalanceAmount(limitDraft, editDisplay, currency),
                  })}
                </span>
              )}
            </div>
            {limitDraft != null && (
              <Progress
                value={usedPercent}
                aria-label={localize('com_nav_balance_personal_spend_used_label')}
                variant={progressVariant}
                data-testid="personal-spend-progress"
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                id="personal-spend-limit-label"
                className="text-text-secondary text-sm"
                htmlFor="personal-spend-limit-input"
              >
                {localize(
                  editDisplay === 'currency'
                    ? 'com_nav_balance_personal_spend_limit_currency'
                    : 'com_nav_balance_personal_spend_limit',
                )}
              </label>
              <span className="text-text-tertiary text-xs">
                {localize('com_nav_balance_personal_spend_limit_max', {
                  0: formatBalanceAmount(maxCredits, editDisplay, currency),
                })}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Slider
                value={[Math.min(maxInput, Math.max(0, inputValue ?? 0))]}
                onValueChange={onSliderChange}
                min={0}
                max={maxInput}
                step={inputStep}
                className="h-4 flex-1"
                disabled={mutation.isLoading}
                aria-labelledby="personal-spend-limit-label"
                aria-describedby={showError ? 'personal-spend-limit-error' : undefined}
                aria-valuetext={
                  limitDraft == null
                    ? undefined
                    : formatBalanceAmount(limitDraft, editDisplay, currency)
                }
              />
              <Input
                id="personal-spend-limit-input"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxInput}
                step={inputStep}
                value={inputValue ?? ''}
                onChange={onInputChange}
                disabled={mutation.isLoading}
                aria-labelledby="personal-spend-limit-label"
                aria-invalid={showError}
                aria-describedby={showError ? 'personal-spend-limit-error' : undefined}
                data-testid="personal-spend-limit-input"
                className="h-9 w-28 shrink-0"
              />
            </div>

            {showError && (
              <p
                id="personal-spend-limit-error"
                className="text-text-destructive text-xs"
                role="alert"
                data-testid="personal-spend-limit-error"
              >
                {localize(errorMessageKey(draftError), {
                  0: formatBalanceAmount(maxCredits, editDisplay, currency),
                })}
              </p>
            )}

            {enabled && limitDraft == null && !touched && (
              <p className="text-text-secondary text-xs" data-testid="personal-spend-limit-hint">
                {localize('com_nav_balance_personal_spend_limit_required_hint')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="submit"
              onClick={onSaveLimit}
              disabled={mutation.isLoading || draftError != null}
              data-testid="personal-spend-limit-save"
            >
              {localize('com_ui_save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onClearLimit}
              disabled={mutation.isLoading || (savedLimit == null && !enabled)}
              data-testid="personal-spend-limit-clear"
            >
              {localize('com_ui_clear')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function errorMessageKey(
  error: Exclude<LimitError, null>,
):
  | 'com_nav_balance_personal_spend_limit_required'
  | 'com_nav_balance_personal_spend_limit_invalid'
  | 'com_nav_balance_personal_spend_limit_negative'
  | 'com_nav_balance_personal_spend_limit_too_large'
  | 'com_nav_balance_personal_spend_limit_integer' {
  switch (error) {
    case 'required':
      return 'com_nav_balance_personal_spend_limit_required';
    case 'negative':
      return 'com_nav_balance_personal_spend_limit_negative';
    case 'too_large':
      return 'com_nav_balance_personal_spend_limit_too_large';
    case 'not_integer':
      return 'com_nav_balance_personal_spend_limit_integer';
    case 'not_a_number':
    default:
      return 'com_nav_balance_personal_spend_limit_invalid';
  }
}
