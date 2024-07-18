import { useGetCategories } from '~/data-provider';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import useLocalize from '~/hooks/useLocalize';

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

const useCategories = (className = '') => {
  const localize = useLocalize();
  const { data: categories = loadingCategories } = useGetCategories({
    select: (data) =>
      data.map((category) => ({
        label: category.label
          ? localize(`com_ui_${category.label}`) || category.label
          : localize('com_ui_select_a_category'),
        value: category.value,
        icon: category.value ? (
          <CategoryIcon category={category.value} className={className} />
        ) : null,
      })),
  });

  return { categories, emptyCategory };
};

export default useCategories;
