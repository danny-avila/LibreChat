import { useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Input, Label, DropdownPopup } from '@librechat/client';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { UseFormRegister } from 'react-hook-form';
import type { MenuItemProps } from '~/common';
import { useLocalize } from '~/hooks';

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
  const localize = useLocalize();
  const [passwordVisibility, setPasswordVisibility] = useState<Record<string, boolean>>({});
  const selectedOption = dropdownOptions.find((opt) => opt.key === selectedKey);
  const dropdownItems: MenuItemProps[] = dropdownOptions.map((option) => ({
    label: option.label,
    onClick: () => onSelectionChange(option.key),
  }));

  const togglePasswordVisibility = (fieldName: string) => {
    setPasswordVisibility((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-md w-fit font-medium">{title}</Label>
        {showDropdown ? (
          <DropdownPopup
            menuId={`${dropdownKey}-dropdown`}
            items={dropdownItems}
            isOpen={dropdownOpen}
            setIsOpen={setDropdownOpen}
            trigger={
              <Menu.MenuButton
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary"
              >
                {selectedOption?.label}
                <ChevronDown className="ml-1 h-4 w-4" />
              </Menu.MenuButton>
            }
          />
        ) : (
          <div className="text-sm text-text-secondary">{selectedOption?.label}</div>
        )}
      </div>
      {selectedOption?.inputs &&
        Object.entries(selectedOption.inputs).map(([name, config], index) => (
          <div key={name}>
            <div className="relative">
              <Input
                type={'text'} // so password autofill doesn't show
                placeholder={config.placeholder}
                autoComplete={config.type === 'password' ? 'one-time-code' : 'off'}
                readOnly={config.type === 'password'}
                onFocus={
                  config.type === 'password' ? (e) => (e.target.readOnly = false) : undefined
                }
                className={`${index > 0 ? 'mb-2' : 'mb-2'} ${
                  config.type === 'password' ? 'pr-10' : ''
                }`}
                {...register(name as keyof SearchApiKeyFormData)}
              />
              {config.type === 'password' && (
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility(name)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-text-primary"
                  aria-label={
                    passwordVisibility[name]
                      ? localize('com_ui_hide_password')
                      : localize('com_ui_show_password')
                  }
                >
                  <div className="relative h-4 w-4">
                    {passwordVisibility[name] ? (
                      <EyeOff className="absolute inset-0 h-4 w-4 duration-200 animate-in fade-in" />
                    ) : (
                      <Eye className="absolute inset-0 h-4 w-4 duration-200 animate-in fade-in" />
                    )}
                  </div>
                </button>
              )}
            </div>
            {config.link && (
              <div className="mt-1 text-xs text-text-secondary">
                <a
                  href={config.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {config.link.text}
                </a>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

export type { InputConfig, DropdownOption };
