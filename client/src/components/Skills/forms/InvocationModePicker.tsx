import { useState, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { InvocationMode } from 'librechat-data-provider';
import type { MenuItemProps } from '@librechat/client';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const invocationLabels: Record<InvocationMode, TranslationKeys> = {
  [InvocationMode.auto]: 'com_ui_invocation_auto',
  [InvocationMode.manual]: 'com_ui_invocation_manual',
  [InvocationMode.both]: 'com_ui_invocation_both',
};

const invocationDescriptions: Record<InvocationMode, TranslationKeys> = {
  [InvocationMode.auto]: 'com_ui_invocation_auto_info',
  [InvocationMode.manual]: 'com_ui_invocation_manual_info',
  [InvocationMode.both]: 'com_ui_invocation_both_info',
};

const modes = [InvocationMode.auto, InvocationMode.manual, InvocationMode.both];

interface InvocationModePickerProps {
  value: InvocationMode;
  onChange: (mode: InvocationMode) => void;
}

export default function InvocationModePicker({ value, onChange }: InvocationModePickerProps) {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems: MenuItemProps[] = useMemo(
    () =>
      modes.map((mode) => ({
        id: mode,
        label: localize(invocationLabels[mode]),
        onClick: () => {
          onChange(mode);
          setIsOpen(false);
        },
        render: (props) => (
          <button {...props}>
            <div className="flex flex-col items-start gap-0.5 text-left">
              <span className="font-medium text-text-primary">
                {localize(invocationLabels[mode])}
              </span>
              <span className="text-xs text-text-secondary">
                {localize(invocationDescriptions[mode])}
              </span>
            </div>
          </button>
        ),
      })),
    [localize, onChange],
  );

  return (
    <div className="flex flex-col">
      <label className="mb-1 text-sm font-medium text-text-secondary">
        {localize('com_ui_invocation_mode')}
      </label>
      <DropdownPopup
        menuId="invocation-mode-menu"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        trigger={
          <Ariakit.MenuButton
            aria-label={localize('com_ui_invocation_mode')}
            className="flex w-fit items-center justify-between gap-2 rounded-xl border border-border-medium bg-transparent px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-tertiary"
          >
            <span className="font-medium text-text-primary">
              {localize(invocationLabels[value])}
            </span>
            <ChevronDown className="size-4 text-text-secondary" aria-hidden="true" />
          </Ariakit.MenuButton>
        }
        items={menuItems}
        className="w-[280px]"
        portal={true}
      />
    </div>
  );
}
