import { useState, useEffect } from 'react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
  Button,
  Label,
  Input,
} from '@librechat/client';
import type { AdminBudgetRow, UpdateBudgetRequest } from 'librechat-data-provider';
import { useUpdateBudgetMutation } from '~/data-provider';
import { creditsToUsdInput, usdToCredits } from './credits';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

function EditBudgetModal({
  row,
  onClose,
}: {
  row: AdminBudgetRow | null;
  onClose: () => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const updateBudget = useUpdateBudgetMutation();
  const [budgetUSD, setBudgetUSD] = useState('');
  const [baselineUSD, setBaselineUSD] = useState('');

  useEffect(() => {
    if (row) {
      setBudgetUSD(creditsToUsdInput(row.monthlyBudget));
      setBaselineUSD(creditsToUsdInput(row.monthlyBudgetBaseline));
    }
  }, [row]);

  const budgetValue = parseFloat(budgetUSD);
  const baselineValue = parseFloat(baselineUSD);
  const isBudgetValid = Number.isFinite(budgetValue) && budgetValue >= 0;
  const isBaselineValid = Number.isFinite(baselineValue) && baselineValue >= 0;

  const initialBudget = row?.monthlyBudget ?? 0;
  const initialBaseline = row?.monthlyBudgetBaseline ?? 0;
  const nextBudget = isBudgetValid ? usdToCredits(budgetValue) : initialBudget;
  const nextBaseline = isBaselineValid ? usdToCredits(baselineValue) : initialBaseline;
  const budgetChanged = isBudgetValid && nextBudget !== initialBudget;
  const baselineChanged = isBaselineValid && nextBaseline !== initialBaseline;

  const hasValidChange =
    isBudgetValid && isBaselineValid && (budgetChanged || baselineChanged);
  const canSave = hasValidChange && !updateBudget.isLoading;

  const handleSave = () => {
    if (!row || !canSave) {
      return;
    }
    const body: UpdateBudgetRequest = {};
    if (budgetChanged) {
      body.monthlyBudget = nextBudget;
    }
    if (baselineChanged) {
      body.monthlyBudgetBaseline = nextBaseline;
    }
    updateBudget.mutate(
      { userId: row.user, body },
      {
        onSuccess: () => {
          showToast({
            message: localize('com_budget_modal_success'),
            severity: NotificationSeverity.SUCCESS,
          });
          onClose();
        },
        onError: () =>
          showToast({
            message: localize('com_budget_modal_error'),
            severity: NotificationSeverity.ERROR,
          }),
      },
    );
  };

  return (
    <OGDialog
      open={row != null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <OGDialogContent className="w-11/12 max-w-md">
        <OGDialogHeader>
          <OGDialogTitle className="text-lg font-medium leading-6">
            {localize('com_budget_modal_title', { name: row?.name ?? row?.email ?? '' })}
          </OGDialogTitle>
        </OGDialogHeader>

        <div className="space-y-4">
          <div className="text-sm">
            <div className="text-text-primary">{row?.name ?? '—'}</div>
            <div className="text-text-secondary">{row?.email ?? '—'}</div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget-monthly">{localize('com_budget_modal_field_budget')}</Label>
            <Input
              id="budget-monthly"
              type="number"
              min="0"
              step="0.01"
              value={budgetUSD}
              onChange={(e) => setBudgetUSD(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget-baseline">{localize('com_budget_modal_field_baseline')}</Label>
            <Input
              id="budget-baseline"
              type="number"
              min="0"
              step="0.01"
              value={baselineUSD}
              onChange={(e) => setBaselineUSD(e.target.value)}
            />
            <p className="text-xs text-text-tertiary">
              {localize('com_budget_modal_baseline_help')}
            </p>
          </div>

          {(!isBudgetValid || !isBaselineValid) && (
            <p className="text-xs text-red-400">{localize('com_budget_modal_invalid')}</p>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {localize('com_budget_modal_cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {localize('com_budget_modal_save')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default EditBudgetModal;
