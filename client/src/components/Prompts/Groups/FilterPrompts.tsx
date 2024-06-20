import { ListFilter, User, Dot } from 'lucide-react';
import React, { useState, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { SystemCategories } from 'librechat-data-provider';
import type { OptionWithIcon } from '~/common';
import { usePromptGroupsNav, useLocalize, useCategories } from '~/hooks';
import {
  Input,
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '~/components/ui';
import { cn } from '~/utils';
import store from '~/store';

export function FilterItem({
  label,
  icon,
  onClick,
  isActive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      className="relative cursor-pointer gap-2 text-text-secondary hover:bg-surface-tertiary focus:bg-surface-tertiary dark:focus:bg-surface-tertiary"
    >
      {icon}
      <span>{label}</span>
      {isActive && (
        <span className="absolute bottom-0 right-0 top-0 flex items-center">
          <Dot />
        </span>
      )}
    </DropdownMenuItem>
  );
}

export function FilterMenu({ onSelect }: { onSelect: (category: string) => void }) {
  const localize = useLocalize();
  const { categories } = useCategories('h-4 w-4 mr-2');
  const categoryFilter = useRecoilValue(store.promptsCategory);
  return (
    <DropdownMenuContent className="max-h-xl min-w-40 overflow-y-auto">
      <DropdownMenuGroup>
        <FilterItem
          label={localize('com_ui_all_proper')}
          icon={<ListFilter className="mr-2 h-4 w-4 text-text-primary" />}
          onClick={() => onSelect(SystemCategories.ALL)}
          isActive={categoryFilter === ''}
        />
        <FilterItem
          label={localize('com_ui_my_prompts')}
          icon={<User className="mr-2 h-4 w-4 text-text-primary" />}
          onClick={() => onSelect(SystemCategories.MY_PROMPTS)}
          isActive={categoryFilter === SystemCategories.MY_PROMPTS}
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {categories
          .filter((category) => category.value)
          .map((category, i) => (
            <FilterItem
              key={`${category.value}-${i}`}
              label={category.label}
              icon={(category as OptionWithIcon).icon}
              onClick={() => onSelect(category.value)}
              isActive={category.value === categoryFilter}
            />
          ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

export default function FilterPrompts({
  setName,
  className = '',
}: Pick<ReturnType<typeof usePromptGroupsNav>, 'setName'> & {
  className?: string;
}) {
  const localize = useLocalize();
  const [displayName, setDisplayName] = useState('');
  const setCategory = useSetRecoilState(store.promptsCategory);

  const onSelect = useCallback(
    (category: string) => {
      if (category === SystemCategories.ALL) {
        setCategory('');
      }
      setCategory(category);
    },
    [setCategory],
  );

  return (
    <div className={cn('flex gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 w-10">
            <ListFilter className="icon-sm" />
          </Button>
        </DropdownMenuTrigger>
        <FilterMenu onSelect={onSelect} />
      </DropdownMenu>
      <Input
        placeholder={localize('com_ui_filter_prompts_name')}
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setName(e.target.value);
        }}
        className="max-w-sm border-border-light focus:bg-surface-tertiary"
      />
    </div>
  );
}
