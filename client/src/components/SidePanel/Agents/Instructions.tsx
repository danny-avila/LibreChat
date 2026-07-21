import { useState, useId } from 'react';
import * as Menu from '@ariakit/react/menu';
import { PlusCircle, Maximize2 } from 'lucide-react';
import { specialVariables } from 'librechat-data-provider';
import { Controller, useFormContext } from 'react-hook-form';
import {
  Button,
  DropdownPopup,
  OGDialog,
  OGDialogClose,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import type { TSpecialVarLabel } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const textareaClass =
  'lc-field flex w-full rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:border-border-medium focus-visible:ring-2 focus-visible:ring-ring-primary disabled:cursor-not-allowed disabled:opacity-50';

interface VariableOption {
  label: TSpecialVarLabel;
  value: string;
}

const variableOptions: VariableOption[] = Object.keys(specialVariables).map((key) => ({
  label: `com_ui_special_var_${key}` as TSpecialVarLabel,
  value: `{{${key}}}`,
}));

export default function Instructions() {
  const menuId = useId();
  const dialogMenuId = useId();
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDialogMenuOpen, setIsDialogMenuOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddVariable = (label: TSpecialVarLabel, value: string) => {
    const currentInstructions = getValues('instructions') || '';
    const spacer = currentInstructions.length > 0 ? '\n' : '';
    const prefix = localize(label);
    setValue('instructions', currentInstructions + spacer + prefix + ': ' + value);
    setIsMenuOpen(false);
    setIsDialogMenuOpen(false);
  };

  const variableItems = variableOptions.map((option) => ({
    label: localize(option.label) || option.label,
    onClick: () => handleAddVariable(option.label, option.value),
  }));

  return (
    <div className="mb-3 flex flex-col">
      <div className="mb-1 flex items-center justify-between">
        <label
          className="block text-[11px] font-medium uppercase tracking-wide text-text-secondary"
          htmlFor="instructions"
        >
          {localize('com_ui_instructions')}
        </label>
        <div className="flex items-center gap-0.5">
          <DropdownPopup
            portal={true}
            mountByState={true}
            unmountOnHide={true}
            preserveTabOrder={true}
            isOpen={isMenuOpen}
            setIsOpen={setIsMenuOpen}
            trigger={
              <Menu.MenuButton
                id="variables-menu-button"
                aria-label={localize('com_ui_variables')}
                title={localize('com_ui_variables')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              >
                <PlusCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
              </Menu.MenuButton>
            }
            items={variableItems}
            menuId={menuId}
            className="pointer-events-auto z-30"
          />
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            aria-label={localize('com_ui_expand_editor')}
            title={localize('com_ui_expand_editor')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
          </button>
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
              className={cn(textareaClass, 'min-h-[88px] resize-y text-sm')}
              id="instructions"
              placeholder={localize('com_agents_instructions_placeholder')}
              rows={3}
              aria-label={localize('com_ui_instructions')}
              aria-required="true"
              aria-invalid={error ? 'true' : 'false'}
            />
            {error && (
              <span
                className="mt-1 text-xs text-red-500 transition duration-300 ease-in-out"
                role="alert"
              >
                {localize('com_ui_field_required')}
              </span>
            )}
          </>
        )}
      />

      <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <OGDialogContent
          className="flex h-[85vh] max-h-[85vh] w-11/12 max-w-6xl flex-col gap-4 p-6"
          showCloseButton={false}
        >
          <OGDialogHeader className="mb-2 pr-14">
            <OGDialogTitle className="text-left text-2xl font-semibold">
              {localize('com_ui_instructions')}
            </OGDialogTitle>
          </OGDialogHeader>
          <Controller
            name="instructions"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                value={field.value ?? ''}
                className={cn(
                  textareaClass,
                  'min-h-0 flex-1 resize-none text-base leading-relaxed',
                )}
                placeholder={localize('com_agents_instructions_placeholder')}
                aria-label={localize('com_ui_instructions')}
              />
            )}
          />
          <div className="flex items-center justify-between">
            <DropdownPopup
              portal={true}
              mountByState={true}
              unmountOnHide={true}
              preserveTabOrder={true}
              isOpen={isDialogMenuOpen}
              setIsOpen={setIsDialogMenuOpen}
              trigger={
                <Menu.MenuButton
                  id="variables-menu-button-dialog"
                  render={
                    <Button variant="outline" className="gap-1.5">
                      <PlusCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
                      {localize('com_ui_variables')}
                    </Button>
                  }
                />
              }
              items={variableItems}
              menuId={dialogMenuId}
              className="pointer-events-auto z-[200]"
            />
            <OGDialogClose asChild>
              <Button>{localize('com_ui_done')}</Button>
            </OGDialogClose>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
