import { useState, useId, useMemo } from 'react';
import * as Menu from '@ariakit/react/menu';
import { useFormContext } from 'react-hook-form';
import { DropdownPopup } from '@librechat/client';
import { specialVariables } from 'librechat-data-provider';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import type { TSpecialVarLabel } from 'librechat-data-provider';
import { getSpecialVariableIcon } from '~/components/Prompts/utils';
import { extractUniqueVariables } from '~/utils';
import { useLiveAnnouncer } from '~/Providers';
import { useLocalize } from '~/hooks';

const variableKeys = Object.keys(specialVariables) as Array<keyof typeof specialVariables>;

interface VariablesDropdownProps {
  fieldName?: string;
  className?: string;
}

export default function VariablesDropdown({
  fieldName = 'prompt',
  className = '',
}: VariablesDropdownProps) {
  const menuId = useId();
  const localize = useLocalize();
  const methods = useFormContext();
  const { setValue, getValues, watch } = methods;
  const { announcePolite } = useLiveAnnouncer();
  const promptText = watch(fieldName) || '';

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const usedVariables = useMemo(() => {
    const vars = extractUniqueVariables(promptText);
    return new Set(vars.map((v) => v.toLowerCase()));
  }, [promptText]);

  const handleAddVariable = (key: string) => {
    const currentText = getValues(fieldName) || '';
    const spacer = currentText.length > 0 ? '\n\n' : '';
    const labelKey = `com_ui_special_var_${key}` as TSpecialVarLabel;
    const prefix = localize(labelKey);
    setValue(fieldName, `${currentText}${spacer}${prefix}: {{${key}}}`, { shouldDirty: true });
    setIsMenuOpen(false);
    const announcement = localize('com_ui_special_variable_added', { 0: prefix });
    announcePolite({ message: announcement, isStatus: true });
  };

  const items = variableKeys.map((key) => {
    const isUsed = usedVariables.has(key);
    const Icon = getSpecialVariableIcon(key);
    const labelKey = `com_ui_special_var_${key}` as TSpecialVarLabel;
    const descKey = `com_ui_special_var_desc_${key}`;

    const iconClass = isUsed
      ? 'bg-surface-tertiary text-text-tertiary'
      : 'bg-surface-tertiary text-text-secondary';

    const labelClass = isUsed ? 'text-text-secondary' : 'text-text-primary';

    return {
      label: localize(labelKey),
      onClick: () => handleAddVariable(key),
      disabled: isUsed,
      icon: <Icon className="size-4" />,
      render: (
        <div className="flex w-full items-start gap-2.5 py-0.5">
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}
          >
            {isUsed ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Icon className="size-3.5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`text-sm font-medium ${labelClass}`}>{localize(labelKey)}</span>
            <p className="mt-0.5 text-xs text-text-secondary">{localize(descKey)}</p>
          </div>
        </div>
      ),
    };
  });

  const usedCount = variableKeys.filter((key) => usedVariables.has(key)).length;

  const buttonClass = isMenuOpen
    ? 'border-border-heavy bg-surface-tertiary text-text-primary'
    : 'border-border-medium bg-surface-secondary text-text-primary hover:bg-surface-tertiary';

  return (
    <div className={className}>
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
            aria-label={localize('com_ui_add_special_variables')}
            className={`group flex h-8 items-center gap-1.5 rounded-lg bg-transparent px-2 text-sm ${buttonClass}`}
          >
            <Sparkles className="size-3.5 text-text-secondary" aria-hidden="true" />
            <span className="hidden text-xs font-medium sm:inline">
              {localize('com_ui_special_variables')}
            </span>
            {usedCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-surface-tertiary text-[10px] font-medium text-text-secondary">
                {usedCount}
              </span>
            )}
            <ChevronDown
              className={`size-3 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Menu.MenuButton>
        }
        items={items}
        menuId={menuId}
        className="z-50 w-64"
        itemClassName="px-2 py-1"
      />
    </div>
  );
}
