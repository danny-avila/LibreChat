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
    <div className="w-full pb-2">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-[36px] min-w-[80px] animate-pulse rounded-md bg-surface-tertiary"
          />
        ))}
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
      <div className="text-center text-text-secondary">{localize('com_ui_no_categories')}</div>
    );
  }

  // Main tabs content
  const tabsContent = (
    <div className="relative w-full pb-2">
      <div
        className="no-scrollbar flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={localize('com_agents_category_tabs_label')}
        aria-orientation="horizontal"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {categories.map((category, index) => (
          <button
            key={category.value}
            id={`category-tab-${category.value}`}
            onClick={() => onChange(category.value)}
            onKeyDown={(e) => handleKeyDown(e, category.value)}
            className={cn(
              'relative mt-1 cursor-pointer select-none whitespace-nowrap rounded-md px-3 py-2',
              activeTab === category.value
                ? 'bg-surface-tertiary text-text-primary'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
            style={{
              scrollSnapAlign: 'start',
            }}
            role="tab"
            aria-selected={activeTab === category.value}
            aria-controls={`tabpanel-${category.value}`}
            tabIndex={activeTab === category.value ? 0 : -1}
            aria-label={`${getCategoryDisplayName(category)} tab (${index + 1} of ${categories.length})`}
          >
            {getCategoryDisplayName(category)}
            {/* Underline for active tab */}
            {activeTab === category.value && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
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
