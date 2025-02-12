import React, { useMemo } from 'react';
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

  return formContext ? (
    <Controller
      name="category"
      control={control}
      render={() => (
        <Dropdown
          value={categoryOption.value ?? ''}
          onChange={(value: string) => {
            setValue('category', value, { shouldDirty: false });
            localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
            onValueChange?.(value);
          }}
          aria-labelledby="category-selector-label"
          ariaLabel="Prompt's category selector"
          className={className}
          options={categories || []}
          renderValue={(option) => (
            <div className="flex items-center space-x-2">
              {option.icon != null && <span>{option.icon as React.ReactNode}</span>}
              <span>{option.label}</span>
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
      renderValue={(option) => (
        <div className="flex items-center space-x-2">
          {option.icon != null && <span>{option.icon as React.ReactNode}</span>}
          <span>{option.label}</span>
        </div>
      )}
    />
  );
};

export default CategorySelector;
