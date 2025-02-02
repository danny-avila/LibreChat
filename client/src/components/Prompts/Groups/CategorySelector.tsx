import React, { useMemo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { LocalStorageKeys } from 'librechat-data-provider';
import { Dropdown } from '~/components/ui';
import { useCategories } from '~/hooks';

const CategorySelector = ({
  currentCategory,
  onValueChange,
}: {
  currentCategory?: string;
  onValueChange?: (value: string) => void;
}) => {
  const { control, watch, setValue } = useFormContext();
  const { categories, emptyCategory } = useCategories();

  const watchedCategory = watch('category');
  const categoryOption = useMemo(
    () =>
      (categories ?? []).find(
        (category) => category.value === (watchedCategory ?? currentCategory),
      ) ?? emptyCategory,
    [watchedCategory, categories, currentCategory, emptyCategory],
  );

  return (
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
          className="w-full"
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
  );
};

export default CategorySelector;
