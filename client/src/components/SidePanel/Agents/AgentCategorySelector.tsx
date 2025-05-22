import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useFormContext,
  Controller,
  useWatch,
  ControllerRenderProps,
  FieldValues,
  FieldPath,
} from 'react-hook-form';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useAgentCategories } from '~/hooks/Agents';
import { OptionWithIcon } from '~/common/types';
import { cn } from '~/utils';

/**
 * A component for selecting agent categories with form validation
 */
const AgentCategorySelector: React.FC = () => {
  const { t } = useTranslation();
  const formContext = useFormContext();
  const { categories } = useAgentCategories();

  // Methods
  const handleCategorySync = (
    field: ControllerRenderProps<FieldValues, FieldPath<FieldValues>>,
    agent_id: string | null,
  ) => {
    useEffect(() => {
      if (agent_id === '') {
        // Form has been reset, ensure field is set to default
        if (field.value !== 'general') {
          field.onChange('general');
        }
      }
      // If value is empty or undefined, default to 'general'
      if (!field.value) {
        field.onChange('general');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field]); // Removing agent_id from dependencies as suggested by ESLint
  };

  const getCategoryDisplayValue = (value: string) => {
    const categoryItem = comboboxItems.find((c) => c.value === value);
    return categoryItem?.label || comboboxItems.find((c) => c.value === 'general')?.label;
  };

  // Always call useWatch
  const agent_id = useWatch({
    name: 'id',
    control: formContext.control,
  });

  // Transform categories to the format expected by ControlCombobox
  const comboboxItems = categories.map((category) => ({
    label: category.label,
    value: category.value,
  }));

  const searchPlaceholder = t('com_ui_search_agent_category', 'Search categories...');
  const ariaLabel = t('com_ui_agent_category_selector_aria', "Agent's category selector");

  return (
    <Controller
      name="category"
      control={formContext.control}
      defaultValue="general"
      render={({ field }) => {
        handleCategorySync(field, agent_id);

        const displayValue = getCategoryDisplayValue(field.value);

        return (
          <ControlCombobox
            selectedValue={field.value || 'general'}
            displayValue={displayValue}
            searchPlaceholder={searchPlaceholder}
            setValue={(value) => {
              field.onChange(value || 'general');
            }}
            items={comboboxItems}
            className=""
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
