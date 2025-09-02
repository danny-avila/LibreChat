import { useState, useId } from 'react';
import { PlusCircle } from 'lucide-react';
import * as Menu from '@ariakit/react/menu';
import { useFormContext } from 'react-hook-form';
import { specialVariables } from 'librechat-data-provider';
import type { TSpecialVarLabel } from 'librechat-data-provider';
import { DropdownPopup } from '~/components';
import { useLocalize } from '~/hooks';

interface VariableOption {
  label: TSpecialVarLabel;
  value: string;
}

const variableOptions: VariableOption[] = Object.keys(specialVariables).map((key) => ({
  label: `com_ui_special_var_${key}` as TSpecialVarLabel,
  value: `{{${key}}}`,
}));

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
  const { setValue, getValues } = methods;

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleAddVariable = (label: TSpecialVarLabel, value: string) => {
    const currentText = getValues(fieldName) || '';
    const spacer = currentText.length > 0 ? '\n\n' : '';
    const prefix = localize(label);
    setValue(fieldName, currentText + spacer + prefix + ': ' + value);
    setIsMenuOpen(false);
  };

  return (
    <div
      className={className}
      title={`${localize('com_ui_add')} ${localize('com_ui_special_variables')}`}
    >
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
            aria-label={`${localize('com_ui_add')} ${localize('com_ui_special_variables')}`}
            className="flex h-8 items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-sm text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
          >
            <PlusCircle className="mr-1 h-3 w-3 text-text-secondary" aria-hidden={true} />
            {localize('com_ui_special_variables')}
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
  );
}
