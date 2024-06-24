import React, { useMemo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useLocalize, useCategories } from '~/hooks';
import { SelectDropDown } from '~/components/ui';
import { cn } from '~/utils';

const CategorySelector = ({
  currentCategory,
  onValueChange,
  className = '',
  tabIndex,
}: {
  currentCategory?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  tabIndex?: number;
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
        <SelectDropDown
          title="Category"
          tabIndex={tabIndex}
          value={categoryOption || ''}
          setValue={(value) => {
            setValue('category', value, { shouldDirty: false });
            localStorage.setItem(LocalStorageKeys.LAST_PROMPT_CATEGORY, value);
            onValueChange?.(value);
          }}
          availableValues={categories}
          showAbove={false}
          showLabel={false}
          emptyTitle={true}
          showOptionIcon={true}
          searchPlaceholder={localize('com_ui_search_categories')}
          className={cn('h-10 w-56 cursor-pointer', className)}
          currentValueClass="text-md gap-2"
          optionsListClass="text-sm max-h-72"
        />
      )}
    />
  );
};

export default CategorySelector;
