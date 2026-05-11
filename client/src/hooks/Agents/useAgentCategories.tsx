import { useCallback, useMemo } from 'react';

import useLocalize from '~/hooks/useLocalize';
import {
  EMPTY_AGENT_CATEGORY,
  VERMEER_AGENT_CATEGORIES,
  LEGACY_AGENT_CATEGORY_IDS,
} from '~/constants/agentCategories';

// This interface matches the structure used by the ControlCombobox component
export interface ProcessedAgentCategory {
  label: string; // Translated label
  description?: string; // Translated description
  value: string; // Category value
  className?: string;
  icon?: string;
}

/**
 * Custom hook providing the Vermeer V1 agent categories (hardcoded, single
 * source of truth for the builder + Marketplace). The backend `/api/categories`
 * endpoint is no longer consulted — categories are defined in
 * VERMEER_AGENT_CATEGORIES.
 *
 * Also exposes `getCategoryLabel(value)`: resolves a category value to its
 * translated label. Legacy IDs stored on existing agents (hr, finance, rd,
 * it, sales, aftersales) are remapped to 'general' so they render cleanly
 * as "📋 Général" instead of falling through to the raw ID or an empty badge.
 */
const useAgentCategories = () => {
  const localize = useLocalize();

  const categories = useMemo(
    (): ProcessedAgentCategory[] =>
      VERMEER_AGENT_CATEGORIES.map((category) => ({
        label: localize(category.label),
        description: category.description ? localize(category.description) : undefined,
        value: category.value,
        className: 'w-full',
      })),
    [localize],
  );

  const emptyCategory = useMemo(
    (): ProcessedAgentCategory => ({
      label: localize(EMPTY_AGENT_CATEGORY.label),
      value: EMPTY_AGENT_CATEGORY.value,
      className: 'w-full',
    }),
    [localize],
  );

  const getCategoryLabel = useCallback(
    (value: string | null | undefined): string => {
      if (!value) {
        return categories.find((c) => c.value === 'general')?.label ?? '';
      }
      const direct = categories.find((c) => c.value === value);
      if (direct) {
        return direct.label;
      }
      if (LEGACY_AGENT_CATEGORY_IDS.includes(value)) {
        return categories.find((c) => c.value === 'general')?.label ?? '';
      }
      return categories.find((c) => c.value === 'general')?.label ?? value;
    },
    [categories],
  );

  return {
    categories,
    emptyCategory,
    getCategoryLabel,
    isLoading: false,
    error: null,
  };
};

export default useAgentCategories;
