import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useLocalize, TranslationKeys } from '~/hooks';
import { useGetCategories } from '~/data-provider';

const loadingCategories: { label: TranslationKeys; value: string }[] = [
  {
    label: 'com_ui_loading',
    value: '',
  },
];

const emptyCategory: { label: TranslationKeys; value: string } = {
  label: 'com_ui_empty_category',
  value: '',
};

const useCategories = ({
  className = '',
  hasAccess = true,
}: {
  className?: string;
  hasAccess?: boolean;
}) => {
  const localize = useLocalize();

  const { data: categories = loadingCategories } = useGetCategories({
    enabled: hasAccess,
    select: (data) =>
      data.map((category) => ({
        label: localize(category.label as TranslationKeys),
        value: category.value,
        icon: category.value ? (
          <CategoryIcon category={category.value} className={className} />
        ) : null,
      })),
  });

  return { categories, emptyCategory };
};

export default useCategories;
