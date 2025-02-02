import React, { useMemo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useLocalize, useCategories } from '~/hooks';
import { cn } from '~/utils';
import { Dropdown } from '~/components/ui';

const CategorySelector = ({
  currentCategory,
  onValueChange,
  className = '',
}: {
  currentCategory?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) => {
  const localize = useLocalize();
  const { control, watch, setValue } = useFormContext();
  const { categories, emptyCategory } = useCategories();

  const watchedCategory = watch('category');
  const categoryOption = useMemo(
    () =>
      categories.find((category) => category.value === (watchedCategory ?? currentCategory)) ??
      emptyCategory,
    [watchedCategory, categories, currentCategory, emptyCategory],
  );

  return (
    <Controller
      name="category"
      control={control}
      render={() => (
        <Dropdown
          label="Category"
          value={categoryOption.value ?? ''}
          onChange={(value: string) => {
            setValue('category', value, { shouldDirty: false });
            localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
            onValueChange?.(value);
          }}
          options={categories || []}
          className={cn('', className)}
        />
      )}
    />
  );
};

export default CategorySelector;
