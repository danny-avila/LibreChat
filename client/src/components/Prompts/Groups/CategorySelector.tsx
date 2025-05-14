import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { LocalStorageKeys } from 'librechat-data-provider';
import { Dropdown } from '~/components/ui';
import { useCategories } from '~/hooks';

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
  const { categories, emptyCategory } = useCategories();

  const control = formContext.control;
  const watch = formContext.watch;
  const setValue = formContext.setValue;

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

  return formContext ? (
    <Controller
      name="category"
      control={control}
      render={() => (
        <Dropdown
          value={displayCategory.value ?? ''}
          label={displayCategory.value ? undefined : t('com_ui_category')}
          onChange={(value: string) => {
            setValue('category', value, { shouldDirty: false });
            localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
            onValueChange?.(value);
          }}
          aria-labelledby="category-selector-label"
          ariaLabel="Prompt's category selector"
          className={className}
          options={categories || []}
          renderValue={() => (
            <div className="flex items-center space-x-2">
              {'icon' in displayCategory && displayCategory.icon != null && (
                <span>{displayCategory.icon as ReactNode}</span>
              )}
              <span>{displayCategory.label}</span>
            </div>
          )}
        />
      )}
    />
  ) : (
    <Dropdown
      value={currentCategory ?? ''}
      onChange={(value: string) => {
        localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
        onValueChange?.(value);
      }}
      aria-labelledby="category-selector-label"
      ariaLabel="Prompt's category selector"
      className={className}
      options={categories || []}
      renderValue={() => (
        <div className="flex items-center space-x-2">
          {'icon' in displayCategory && displayCategory.icon != null && (
            <span>{displayCategory.icon as ReactNode}</span>
          )}
          <span>{displayCategory.label}</span>
        </div>
      )}
    />
  );
};

export default CategorySelector;
