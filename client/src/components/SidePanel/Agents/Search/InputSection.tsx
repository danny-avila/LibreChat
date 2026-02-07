import * as Menu from '@ariakit/react/menu';
import { ChevronDown } from 'lucide-react';
import { Input, Label, SecretInput, DropdownPopup } from '@librechat/client';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { UseFormRegister } from 'react-hook-form';
import type { MenuItemProps } from '~/common';

interface InputConfig {
  placeholder: string;
  type?: 'text' | 'password';
  link?: {
    url: string;
    text: string;
  };
}

interface DropdownOption {
  key: string;
  label: string;
  inputs?: Record<string, InputConfig>;
}

interface InputSectionProps {
  title: string;
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  dropdownOptions: DropdownOption[];
  showDropdown: boolean;
  register: UseFormRegister<SearchApiKeyFormData>;
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  dropdownKey: string;
}

export default function InputSection({
  title,
  selectedKey,
  onSelectionChange,
  dropdownOptions,
  showDropdown,
  register,
  dropdownOpen,
  setDropdownOpen,
  dropdownKey,
}: InputSectionProps) {
  const selectedOption = dropdownOptions.find((opt) => opt.key === selectedKey);
  const dropdownItems: MenuItemProps[] = dropdownOptions.map((option) => ({
    label: option.label,
    onClick: () => onSelectionChange(option.key),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        {showDropdown ? (
          <DropdownPopup
            menuId={`${dropdownKey}-dropdown`}
            items={dropdownItems}
            isOpen={dropdownOpen}
            setIsOpen={setDropdownOpen}
            trigger={
              <Menu.MenuButton
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-light px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover"
              >
                {selectedOption?.label}
                <ChevronDown className="size-4" aria-hidden="true" />
              </Menu.MenuButton>
            }
          />
        ) : (
          <span className="text-sm text-text-secondary">{selectedOption?.label}</span>
        )}
      </div>
      {selectedOption?.inputs && (
        <div className="space-y-2">
          {Object.entries(selectedOption.inputs).map(([name, config]) => (
            <div key={name} className="space-y-1">
              {config.type === 'password' ? (
                <SecretInput
                  placeholder={config.placeholder}
                  {...register(name as keyof SearchApiKeyFormData)}
                />
              ) : (
                <Input
                  type="text"
                  placeholder={config.placeholder}
                  autoComplete="off"
                  {...register(name as keyof SearchApiKeyFormData)}
                />
              )}
              {config.link && (
                <a
                  href={config.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-blue-500 transition-colors hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {config.link.text}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { InputConfig, DropdownOption };
