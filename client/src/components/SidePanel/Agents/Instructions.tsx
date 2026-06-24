/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React, { useState, useId } from 'react';
import { PlusCircle } from 'lucide-react';
import * as Menu from '@ariakit/react/menu';
import { specialVariables } from 'librechat-data-provider';
import { Controller, useFormContext } from 'react-hook-form';
import {
  CircleHelpIcon,
  DropdownPopup,
  ESide,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import type { TSpecialVarLabel } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { njInputClass } from '~/nj/components/Agents/agentInputStyle';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import { useLocalize } from '~/hooks';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

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
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleAddVariable = (label: TSpecialVarLabel, value: string) => {
    const currentInstructions = getValues('instructions') || '';
    const spacer = currentInstructions.length > 0 ? '\n' : '';
    const prefix = localize(label);
    setValue('instructions', currentInstructions + spacer + prefix + ': ' + value);
    setIsMenuOpen(false);
  };

  return (
    <div>
      <div className="mb-2 flex items-center">
        {/* NJ: Customize how we explain the Instructions feature
        <label
          className="text-token-text-primary flex-grow text-sm font-medium"
          htmlFor="instructions"
        >
          {localize('com_ui_instructions')}
        </label>
        */}
        <label
          className="text-token-text-primary block text-sm font-semibold"
          htmlFor="instructions"
        >
          Give your agent a task
          <span className="ml-1 text-red-500">*</span>
        </label>
        <HoverCard openDelay={50}>
          <HoverCardTrigger asChild>
            <span className="ml-2">
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </span>
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  Agents work best when they have a clearly defined identity and behavior. Define
                  your agent&apos;s role, expertise, criteria for success, and how it should
                  respond.
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </HoverCard>
        <div className="ml-auto" title="Add variables to instructions">
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
                aria-label="Add variable to instructions"
                className="flex h-7 items-center gap-1 rounded-md border border-border-medium bg-surface-primary-alt px-2 py-0 text-sm text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
              >
                <PlusCircle className="mr-1 h-3 w-3 text-text-secondary" aria-hidden={true} />
                {localize('com_ui_variables')}
              </Menu.MenuButton>
            }
            items={variableOptions.map((option) => ({
              label: localize(option.label) || option.label,
              onClick: () => handleAddVariable(option.label, option.value),
            }))}
            menuId={menuId}
            className="z-30"
          />
        </div>
      </div>
      <Controller
        name="instructions"
        control={control}
        // NJ: We want agent instructions to be a required field
        rules={{ required: true }}
        render={({ field, fieldState: { error } }) => (
          <>
            <textarea
              {...field}
              value={field.value ?? ''}
              className={cn(njInputClass, 'min-h-[118px] resize-y')}
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
                {/* NJ: custom message for required agent
                instructions field} */}
                Add agent instructions before saving
              </span>
            )}
          </>
        )}
      />
    </div>
  );
}
