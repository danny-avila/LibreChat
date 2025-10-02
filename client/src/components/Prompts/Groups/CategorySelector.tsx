import React, { useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useTranslation } from 'react-i18next';
import { DropdownPopup } from '@librechat/client';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { MenuItemProps } from '@librechat/client';
import type { ReactNode } from 'react';
import { usePromptGroupsContext } from '~/Providers';
import { useCategories } from '~/hooks';
import { cn } from '~/utils';

interface CategorySelectorProps {
  currentCategory?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({
  currentCategory,
  onValueChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const formContext = useFormContext();
  const [isOpen, setIsOpen] = useState(false);
  const { hasAccess } = usePromptGroupsContext();
  const { categories, emptyCategory } = useCategories({ hasAccess });

  const control = formContext?.control;
  const watch = formContext?.watch;
  const setValue = formContext?.setValue;

  const watchedCategory = watch ? watch('category') : currentCategory;

  const categoryOption = useMemo(
    () =>
      (categories ?? []).find(
        (category) => category.value === (watchedCategory ?? currentCategory),
      ) ?? emptyCategory,
    [watchedCategory, categories, currentCategory, emptyCategory],
  );

  const displayCategory = useMemo(() => {
    if (!categoryOption.value && !('icon' in categoryOption)) {
      return {
        ...categoryOption,
        icon: (<span className="i-heroicons-tag" />) as ReactNode,
        label: categoryOption.label || t('com_ui_empty_category'),
      };
    }
    return categoryOption;
  }, [categoryOption, t]);

  const menuItems: MenuItemProps[] = useMemo(() => {
    if (!categories) return [];

    return categories.map((category) => ({
      id: category.value,
      label: category.label,
      icon: 'icon' in category ? category.icon : undefined,
      onClick: () => {
        const value = category.value || '';
        if (formContext && setValue) {
          setValue('category', value, { shouldDirty: false });
        }
        localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
        onValueChange?.(value);
        setIsOpen(false);
      },
    }));
  }, [categories, formContext, setValue, onValueChange]);

  const trigger = (
    <Ariakit.MenuButton
      className={cn(
        'focus:ring-offset-ring-offset relative inline-flex items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary transition-all duration-200 ease-in-out hover:bg-accent hover:text-accent-foreground focus:ring-ring-primary',
        'w-fit gap-2',
        className,
      )}
      onClick={() => setIsOpen(!isOpen)}
      aria-label="Prompt's category selector"
      aria-labelledby="category-selector-label"
    >
      <div className="flex items-center space-x-2">
        {'icon' in displayCategory && displayCategory.icon != null && (
          <span>{displayCategory.icon as ReactNode}</span>
        )}
        <span>{displayCategory.value ? displayCategory.label : t('com_ui_category')}</span>
      </div>
      <Ariakit.MenuButtonArrow />
    </Ariakit.MenuButton>
  );

  return formContext ? (
    <Controller
      name="category"
      control={control}
      render={() => (
        <DropdownPopup
          trigger={trigger}
          items={menuItems}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          menuId="category-selector-menu"
          className="mt-2"
          portal={true}
        />
      )}
    />
  ) : (
    <DropdownPopup
      trigger={trigger}
      items={menuItems}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      menuId="category-selector-menu"
      className="mt-2"
      portal={true}
    />
  );
};

export default CategorySelector;
