import React, { useState } from 'react';
import { Button } from '../../ui/Button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioItem
} from '../../ui/DropdownMenu.tsx';

const ModelSelect = ({ model, onChange, models, ...props }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  models = ['gpt-4', 'text-davinci-003', 'gpt-3.5-turbo', 'gpt-3.5-turbo-0301'];

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button {...props}>
          <span className="w-full text-center text-xs font-medium font-normal">Model: {model}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 dark:bg-gray-700"
        onCloseAutoFocus={event => event.preventDefault()}
      >
        <DropdownMenuLabel className="dark:text-gray-300">Select a model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={model}
          onValueChange={onChange}
          className="overflow-y-auto"
        >
          {models.map(model => (
            <DropdownMenuRadioItem
              key={model}
              value={model}
              className="dark:font-semibold dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {model}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelSelect;
