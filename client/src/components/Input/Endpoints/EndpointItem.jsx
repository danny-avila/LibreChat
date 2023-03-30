import React from 'react';
import { DropdownMenuRadioItem } from '../../ui/DropdownMenu.tsx';
import getIcon from '~/utils/getIcon';

export default function ModelItem({ endpoint, value, onSelect }) {
  const icon = getIcon({
    size: 20,
    endpoint,
    error: false,
    className: 'mr-2'
  });

  // regular model
  return (
    <DropdownMenuRadioItem
      value={value}
      className="dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
    >
      {icon}
      {endpoint}
      {endpoint in ['azureOpenAI', 'openAI'] && <sup>$</sup>}
    </DropdownMenuRadioItem>
  );
}
