import React from 'react';
import MultiSelect from '~/components/ui/MultiSelect';

const foodItems = [
  'Apple',
  'Bacon',
  'Banana',
  'Broccoli',
  'Burger',
  'Cake',
  'Candy',
  'Carrot',
  'Cherry',
  'Chocolate',
  'Cookie',
  'Cucumber',
  'Donut',
  'Fish',
  'Fries',
  'Grape',
  'Ice cream',
  'Pizza',
  'Salad',
  'Steak',
];

export function MCPSelect() {
  const handleSelectedValuesChange = (values: string[]) => {
    console.log('Selected foods:', values);
  };

  return (
    <MultiSelect
      items={foodItems}
      placeholder="Select foods..."
      // defaultSelectedValues={['Steak']}
      onSelectedValuesChange={handleSelectedValuesChange}
      className="badge-icon h-full min-w-[150px]"
      selectClassName="group relative inline-flex items-center gap-1.5 rounded-full border border-border-medium text-sm font-medium transition-shadow md:w-full size-9 p-2 md:p-3 bg-surface-chat shadow-sm hover:bg-surface-hover hover:shadow-md active:shadow-inner"
      popoverClassName="min-w-[200px]"
    />
  );
}
