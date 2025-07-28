import React from 'react';
import { useAgentCategories } from '~/hooks/Agents';
import { cn } from '~/utils';

interface AgentCategoryDisplayProps {
  category?: string;
  className?: string;
  showIcon?: boolean;
  iconClassName?: string;
  showEmptyFallback?: boolean;
}

/**
 * Component to display an agent category with proper translation
 *
 * @param category - The category value (e.g., "general", "hr", etc.)
 * @param className - Optional className for the container
 * @param showIcon - Whether to show the category icon
 * @param iconClassName - Optional className for the icon
 * @param showEmptyFallback - Whether to show a fallback for empty categories
 */
const AgentCategoryDisplay: React.FC<AgentCategoryDisplayProps> = ({
  category,
  className = '',
  showIcon = true,
  iconClassName = 'h-4 w-4 mr-2',
  showEmptyFallback = false,
}) => {
  const { categories, emptyCategory } = useAgentCategories();

  // Find the category in our processed categories list
  const categoryItem = categories.find((c) => c.value === category);

  // Handle empty string case differently than undefined/null
  if (category === '') {
    if (!showEmptyFallback) {
      return null;
    }
    // Show the empty category placeholder
    return (
      <div className={cn('flex items-center text-gray-400', className)}>
        <span>{emptyCategory.label}</span>
      </div>
    );
  }

  // No category or unknown category
  if (!category || !categoryItem) {
    return null;
  }

  return (
    <div className={cn('flex items-center', className)}>
      {showIcon && categoryItem.icon && (
        <span className={cn('flex-shrink-0', iconClassName)}>{categoryItem.icon}</span>
      )}
      <span>{categoryItem.label}</span>
    </div>
  );
};

export default AgentCategoryDisplay;
