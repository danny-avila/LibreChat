import React, { useMemo } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useGetCategories } from '~/data-provider';
import { SelectDropDown } from '~/components/ui';
import CategoryIcon from './CategoryIcon';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const loadingCategories = [
  {
    label: 'Loading...',
    value: '',
  },
];

const emptyCategory = {
  label: '-',
  value: '',
};

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
  const { data: categories = loadingCategories } = useGetCategories({
    select: (data) =>
      data.map((category) => ({
        label: category.label
          ? localize(`com_ui_${category.label}`)
          : localize('com_ui_none_selected'),
        value: category.value,
        icon: <CategoryIcon category={category.value} />,
      })),
  });

  const watchedCategory = watch('category');
  const categoryOption = useMemo(
    () =>
      categories.find((category) => category.value === (watchedCategory ?? currentCategory)) ??
      emptyCategory,
    [watchedCategory, categories, currentCategory],
  );

  return (
    <Controller
      name="category"
      control={control}
      render={() => (
        <SelectDropDown
          title="Category"
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
          searchPlaceholder="Search categories..."
          className={cn('h-10 w-56 cursor-pointer', className)}
          currentValueClass="text-md gap-2"
          optionsListClass="text-sm"
        />
      )}
    />
  );
};

export default CategorySelector;
