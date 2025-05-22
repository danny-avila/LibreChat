import { renderHook } from '@testing-library/react';
import useAgentCategories from '../useAgentCategories';
import { AGENT_CATEGORIES, EMPTY_AGENT_CATEGORY } from '~/constants/agentCategories';

// Mock the useLocalize hook
jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => {
    // Simple mock implementation that returns the key as the translation
    return key === 'com_ui_agent_category_general' ? 'General (Translated)' : key;
  },
}));

describe('useAgentCategories', () => {
  it('should return processed categories with correct structure', () => {
    const { result } = renderHook(() => useAgentCategories());

    // Check that we have the expected number of categories
    expect(result.current.categories.length).toBe(AGENT_CATEGORIES.length);

    // Check that the first category has the expected structure
    const firstCategory = result.current.categories[0];
    const firstOriginalCategory = AGENT_CATEGORIES[0];

    expect(firstCategory.value).toBe(firstOriginalCategory.value);

    // Check that labels are properly translated
    expect(firstCategory.label).toBe('General (Translated)');
    expect(firstCategory.className).toBe('w-full');

    // Check the empty category
    expect(result.current.emptyCategory.value).toBe(EMPTY_AGENT_CATEGORY.value);
    expect(result.current.emptyCategory.label).toBeTruthy();
  });
});
