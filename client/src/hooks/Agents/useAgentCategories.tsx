import { useMemo } from 'react';

import useLocalize from '~/hooks/useLocalize';
import { useGetAgentCategoriesQuery } from '~/data-provider/Agents';
import { EMPTY_AGENT_CATEGORY } from '~/constants/agentCategories';

// This interface matches the structure used by the ControlCombobox component
export interface ProcessedAgentCategory {
  label: string; // Translated label
  value: string; // Category value
  className?: string;
  icon?: string;
}

/**
 * Custom hook that provides processed and translated agent categories from API
 *
 * @returns Object containing categories, emptyCategory, and loading state
 */
const useAgentCategories = () => {
  const localize = useLocalize();

  // Fetch categories from API
  const categoriesQuery = useGetAgentCategoriesQuery({
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  const categories = useMemo((): ProcessedAgentCategory[] => {
    if (!categoriesQuery.data) return [];

    // Filter out special categories (promoted, all) and convert to form format
    return categoriesQuery.data
      .filter((category) => category.value !== 'promoted' && category.value !== 'all')
      .map((category) => ({
        label: category.label || category.value,
        value: category.value,
        className: 'w-full',
      }));
  }, [categoriesQuery.data]);

  const emptyCategory = useMemo(
    (): ProcessedAgentCategory => ({
      label: localize(EMPTY_AGENT_CATEGORY.label),
      value: EMPTY_AGENT_CATEGORY.value,
      className: 'w-full',
    }),
    [localize],
  );

  return {
    categories,
    emptyCategory,
    isLoading: categoriesQuery.isLoading,
    error: categoriesQuery.error,
  };
};

export default useAgentCategories;
