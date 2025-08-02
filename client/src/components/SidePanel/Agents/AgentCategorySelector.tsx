import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ControlCombobox } from '@librechat/client';
import {
  useWatch,
  FieldPath,
  Controller,
  FieldValues,
  useFormContext,
  ControllerRenderProps,
} from 'react-hook-form';
import { useAgentCategories } from '~/hooks/Agents';
import { cn } from '~/utils';

/**
 * Custom hook to handle category synchronization
 */
const useCategorySync = (agent_id: string | null) => {
  const [handled, setHandled] = useState(false);

  return {
    syncCategory: <T extends FieldPath<FieldValues>>(
      field: ControllerRenderProps<FieldValues, T>,
    ) => {
      // Only run once and only for new agents
      if (!handled && agent_id === '' && !field.value) {
        field.onChange('general');
        setHandled(true);
      }
    },
  };
};

/**
 * A component for selecting agent categories with form validation
 */
const AgentCategorySelector: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const formContext = useFormContext();
  const { categories } = useAgentCategories();

  // Always call useWatch
  const agent_id = useWatch({
    name: 'id',
    control: formContext.control,
  });

  // Use custom hook for category sync
  const { syncCategory } = useCategorySync(agent_id);

  // Transform categories to the format expected by ControlCombobox
  const comboboxItems = categories.map((category) => ({
    label: category.label,
    value: category.value,
  }));

  const getCategoryDisplayValue = (value: string) => {
    const categoryItem = comboboxItems.find((c) => c.value === value);
    return categoryItem?.label || comboboxItems.find((c) => c.value === 'general')?.label;
  };

  const searchPlaceholder = t('com_ui_search_agent_category', 'Search categories...');
  const ariaLabel = t('com_ui_agent_category_selector_aria', "Agent's category selector");

  return (
    <Controller
      name="category"
      control={formContext.control}
      defaultValue="general"
      render={({ field }) => {
        // Sync category if needed (without using useEffect in render)
        syncCategory(field);

        const displayValue = getCategoryDisplayValue(field.value);

        return (
          <ControlCombobox
            selectedValue={field.value}
            displayValue={displayValue}
            searchPlaceholder={searchPlaceholder}
            setValue={(value) => {
              field.onChange(value);
            }}
            items={comboboxItems}
            className={cn(className)}
            ariaLabel={ariaLabel}
            isCollapsed={false}
            showCarat={true}
          />
        );
      }}
    />
  );
};

export default AgentCategorySelector;
