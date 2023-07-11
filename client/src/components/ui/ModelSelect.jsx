import React, { useState } from 'react';
import { Button } from './Button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioItem
} from './DropdownMenu.tsx';
import store from '~/store';
import { useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';

const ModelSelect = ({ model, onChange, availableModels, ...props }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = useRecoilValue(store.lang);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button {...props}>
          <span className="w-full text-center text-xs font-medium font-normal">{localize(lang, 'com_ui_model')}: {model}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 dark:bg-gray-700"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuLabel className="dark:text-gray-300">{localize(lang, 'com_ui_select_model')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={model} onValueChange={onChange} className="overflow-y-auto">
          {availableModels.map((model) => (
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
