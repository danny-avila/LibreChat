import React from 'react';
import { useMediaQuery } from '@librechat/client';
import type t from 'librechat-data-provider';
import { useLocalize, TranslationKeys } from '~/hooks';
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
 * Features multi-row wrapping for better responsive behavior.
 */
const CategoryTabs: React.FC<CategoryTabsProps> = ({
  categories,
  activeTab,
  isLoading,
  onChange,
}) => {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  /** Helper function to get category display name from database data */
  const getCategoryDisplayName = (category: t.TCategory) => {
    // Special cases for system categories
    if (category.value === 'promoted') {
      return localize('com_agents_top_picks');
    }
    if (category.value === 'all') {
      return localize('com_agents_all_category');
    }
    if (category.label && category.label.startsWith('com_')) {
      return localize(category.label as TranslationKeys);
    }
    // Use database label or fallback to capitalized value
    return category.label || category.value.charAt(0).toUpperCase() + category.value.slice(1);
  };

  const loadingSkeleton = (
    <div className="w-full pb-2">
      <div className="flex flex-wrap justify-center gap-1.5 px-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-[36px] min-w-[80px] animate-pulse rounded-lg bg-surface-tertiary"
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
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : categories.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex < categories.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Move up a row (approximate by moving back ~4-6 items)
        newIndex = Math.max(0, currentIndex - 5);
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Move down a row (approximate by moving forward ~4-6 items)
        newIndex = Math.min(categories.length - 1, currentIndex + 5);
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
        if (newTab) {
          newTab.focus();
        }
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
    <div className="w-full pb-2">
      <div
        className={cn(
          'px-4',
          isSmallScreen
            ? 'scrollbar-hide flex gap-2 overflow-x-auto scroll-smooth'
            : 'flex flex-wrap justify-center gap-1.5',
        )}
        role="tablist"
        aria-label={localize('com_agents_category_tabs_label')}
        aria-orientation="horizontal"
        style={
          isSmallScreen
            ? {
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }
            : undefined
        }
      >
        {categories.map((category, index) => (
          <button
            key={category.value}
            id={`category-tab-${category.value}`}
            onClick={() => onChange(category.value)}
            onKeyDown={(e) => handleKeyDown(e, category.value)}
            className={cn(
              'relative cursor-pointer select-none whitespace-nowrap px-3 py-2 transition-all duration-200',
              isSmallScreen ? 'min-w-fit flex-shrink-0' : '',
              activeTab === category.value
                ? 'rounded-t-lg bg-surface-hover text-text-primary'
                : 'rounded-lg bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-95',
            )}
            role="tab"
            aria-selected={activeTab === category.value}
            aria-controls={`tabpanel-${category.value}`}
            tabIndex={activeTab === category.value ? 0 : -1}
            aria-label={localize('com_agents_category_tab_label', {
              category: getCategoryDisplayName(category),
              position: index + 1,
              total: categories.length,
            })}
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
