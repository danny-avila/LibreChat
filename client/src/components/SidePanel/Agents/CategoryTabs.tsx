import React from 'react';

import type t from 'librechat-data-provider';

import useLocalize from '~/hooks/useLocalize';
import { SmartLoader } from './SmartLoader';
import { cn } from '~/utils';

/**
 * Props for the CategoryTabs component
 */
interface CategoryTabsProps {
  /** Array of agent categories to display as tabs */
  categories: t.TMarketplaceCategory[];
  /** Currently selected tab value */
  activeTab: string;
  /** Whether categories are currently loading */
  isLoading: boolean;
  /** Callback fired when a tab is selected */
  onChange: (value: string) => void;
}

/**
 * CategoryTabs - Component for displaying category tabs with counts
 *
 * Renders a tabbed navigation interface showing agent categories.
 * Includes loading states, empty state handling, and displays counts for each category.
 * Uses database-driven category labels with no hardcoded values.
 */
const CategoryTabs: React.FC<CategoryTabsProps> = ({
  categories,
  activeTab,
  isLoading,
  onChange,
}) => {
  const localize = useLocalize();

  // Helper function to get category display name from database data
  const getCategoryDisplayName = (category: t.TCategory) => {
    // Special cases for system categories
    if (category.value === 'promoted') {
      return localize('com_agents_top_picks');
    }
    if (category.value === 'all') {
      return 'All';
    }
    // Use database label or fallback to capitalized value
    return category.label || category.value.charAt(0).toUpperCase() + category.value.slice(1);
  };

  // Loading skeleton component
  const loadingSkeleton = (
    <div className="mb-8">
      <div className="flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-6 min-w-[60px] animate-pulse rounded bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    </div>
  );

  // Handle keyboard navigation between tabs
  const handleKeyDown = (e: React.KeyboardEvent, currentCategory: string) => {
    const currentIndex = categories.findIndex((cat) => cat.value === currentCategory);
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : categories.length - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex < categories.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = categories.length - 1;
        break;
      default:
        return;
    }

    const newCategory = categories[newIndex];
    if (newCategory) {
      onChange(newCategory.value);
      // Focus the new tab
      setTimeout(() => {
        const newTab = document.getElementById(`category-tab-${newCategory.value}`);
        newTab?.focus();
      }, 0);
    }
  };

  // Early return if no categories available
  if (!isLoading && (!categories || categories.length === 0)) {
    return (
      <div className="mb-8 text-center text-gray-500">{localize('com_agents_no_categories')}</div>
    );
  }

  // Main tabs content
  const tabsContent = (
    <div className="mb-8">
      <div className="flex justify-center">
        {/* Accessible tab navigation with proper ARIA attributes */}
        <div
          className="flex flex-wrap items-center justify-center gap-6"
          role="tablist"
          aria-label={localize('com_agents_category_tabs_label')}
          aria-orientation="horizontal"
        >
          {categories.map((category, index) => (
            <button
              key={category.value}
              id={`category-tab-${category.value}`}
              onClick={() => onChange(category.value)}
              onKeyDown={(e) => handleKeyDown(e, category.value)}
              className={cn(
                'relative px-4 py-2 text-sm font-medium transition-colors duration-200',
                'focus:bg-gray-100 focus:outline-none dark:focus:bg-gray-800',
                'hover:text-gray-900 dark:hover:text-white',
                activeTab === category.value
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400',
              )}
              role="tab"
              aria-selected={activeTab === category.value}
              aria-controls={`tabpanel-${category.value}`}
              tabIndex={activeTab === category.value ? 0 : -1}
              aria-label={`${getCategoryDisplayName(category)} tab (${index + 1} of ${categories.length})`}
            >
              <span className="truncate">{getCategoryDisplayName(category)}</span>
              {/* Underline for active tab */}
              {activeTab === category.value && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-gray-900 dark:bg-white"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Use SmartLoader to prevent category loading flashes
  return (
    <SmartLoader
      isLoading={isLoading}
      hasData={categories?.length > 0}
      delay={100} // Very short delay since categories should load quickly
      loadingComponent={loadingSkeleton}
    >
      {tabsContent}
    </SmartLoader>
  );
};

export default CategoryTabs;
