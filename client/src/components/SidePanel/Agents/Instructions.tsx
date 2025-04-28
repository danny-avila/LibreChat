import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { PlusCircle } from 'lucide-react';
import type { AgentForm } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useLocalize } from '~/hooks';

const labelClass = 'mb-2 text-token-text-primary font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

interface VariableOption {
  label: string;
  value: string;
}

export default function Instructions() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  // Special variables that will be processed by the backend
  const variableOptions: VariableOption[] = [
    { label: 'Current Date', value: '{{current_date}}' },
    { label: 'Current User', value: '{{current_user}}' },
  ];

  const handleAddVariable = (value: string) => {
    const currentInstructions = getValues('instructions') || '';
    // Add a space before the variable if the current instructions don't end with a space
    const spacer = currentInstructions.length > 0 && !currentInstructions.endsWith(' ') ? ' ' : '';
    setValue('instructions', currentInstructions + spacer + value);
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center">
        <label className="text-token-text-primary flex-grow font-medium" htmlFor="instructions">
          {localize('com_ui_instructions')}
        </label>
        <div className="ml-auto" title="Add variables to instructions">
          <ControlCombobox
            selectedValue=""
            displayValue="Add variables"
            items={variableOptions.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            setValue={handleAddVariable}
            ariaLabel="Add variable to instructions"
            searchPlaceholder="Search variables"
            selectPlaceholder="Add"
            isCollapsed={false}
            SelectIcon={<PlusCircle className="h-3 w-3 text-text-secondary" />}
            containerClassName="w-fit"
            className="h-7 gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-sm text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
            iconSide="left"
            showCarat={false}
          />
        </div>
      </div>
      <Controller
        name="instructions"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <>
            <textarea
              {...field}
              value={field.value ?? ''}
              className={cn(inputClass, 'min-h-[100px] resize-y')}
              id="instructions"
              placeholder={localize('com_agents_instructions_placeholder')}
              rows={3}
              aria-label="Agent instructions"
              aria-required="true"
              aria-invalid={error ? 'true' : 'false'}
            />
            {error && (
              <span
                className="text-sm text-red-500 transition duration-300 ease-in-out"
                role="alert"
              >
                {localize('com_ui_field_required')}
              </span>
            )}
          </>
        )}
      />
    </div>
  );
}
