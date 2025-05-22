import { useMemo } from 'react';
import useLocalize from '~/hooks/useLocalize';
import { AGENT_CATEGORIES, EMPTY_AGENT_CATEGORY } from '~/constants/agentCategories';
import { ReactNode } from 'react';

// This interface matches the structure used by the ControlCombobox component
export interface ProcessedAgentCategory {
  label: string; // Translated label
  value: string; // Category value
  className?: string;
  icon?: ReactNode; // Optional icon for the category
}

/**
 * Custom hook that provides processed and translated agent categories
 *
 * @returns Object containing categories and emptyCategory
 */
const useAgentCategories = () => {
  const localize = useLocalize();

  const categories = useMemo((): ProcessedAgentCategory[] => {
    return AGENT_CATEGORIES.map((category) => ({
      label: localize(category.label),
      value: category.value,
      className: 'w-full',
      // Note: Icons for categories should be handled separately
      // This fixes the interface but doesn't implement icons
    }));
  }, [localize]);

  const emptyCategory = useMemo(
    (): ProcessedAgentCategory => ({
      label: localize(EMPTY_AGENT_CATEGORY.label),
      value: EMPTY_AGENT_CATEGORY.value,
      className: 'w-full',
    }),
    [localize],
  );

  return { categories, emptyCategory };
};

export default useAgentCategories;
