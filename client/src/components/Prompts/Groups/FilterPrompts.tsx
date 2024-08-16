import { ListFilter, User, Share2, Dot } from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';
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

export function FilterMenu({
  onSelect,
}: {
  onSelect: (category: string, icon?: React.ReactNode | null) => void;
}) {
  const localize = useLocalize();
  const { categories } = useCategories('h-4 w-4');
  const memoizedCategories = useMemo(() => {
    const noCategory = {
      label: localize('com_ui_no_category'),
      value: SystemCategories.NO_CATEGORY,
    };
    if (!categories) {
      return [noCategory];
    }

    return [noCategory, ...categories];
  }, [categories, localize]);

  const categoryFilter = useRecoilValue(store.promptsCategory);
  return (
    <DropdownMenuContent className="max-h-xl min-w-48 overflow-y-auto">
      <DropdownMenuGroup>
        <FilterItem
          label={localize('com_ui_all_proper')}
          icon={<ListFilter className="h-4 w-4 text-text-primary" />}
          onClick={() => onSelect(SystemCategories.ALL, <ListFilter className="icon-sm" />)}
          isActive={categoryFilter === ''}
        />
        <FilterItem
          label={localize('com_ui_my_prompts')}
          icon={<User className="h-4 w-4 text-text-primary" />}
          onClick={() => onSelect(SystemCategories.MY_PROMPTS, <User className="h-4 w-4" />)}
          isActive={categoryFilter === SystemCategories.MY_PROMPTS}
        />
        <FilterItem
          label={localize('com_ui_shared_prompts')}
          icon={<Share2 className="h-4 w-4 text-text-primary" />}
          onClick={() => onSelect(SystemCategories.SHARED_PROMPTS, <Share2 className="h-4 w-4" />)}
          isActive={categoryFilter === SystemCategories.SHARED_PROMPTS}
        />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {memoizedCategories
          .filter((category) => category.value)
          .map((category, i) => (
            <FilterItem
              key={`${category.value}-${i}`}
              label={category.label}
              icon={(category as OptionWithIcon).icon}
              onClick={() => onSelect(category.value, (category as OptionWithIcon).icon)}
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
  const [selectedIcon, setSelectedIcon] = useState(<ListFilter className="icon-sm" />);

  const onSelect = useCallback(
    (category: string, icon?: React.ReactNode | null) => {
      if (category === SystemCategories.ALL) {
        setSelectedIcon(<ListFilter className="icon-sm" />);
        return setCategory('');
      }
      setCategory(category);
      if (icon && React.isValidElement(icon)) {
        setSelectedIcon(icon);
      }
    },
    [setCategory],
  );

  return (
    <div className={cn('flex gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 flex-shrink-0"
            id="filter-prompts"
            aria-label="filter-prompts"
          >
            {selectedIcon}
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
        className="w-full border-border-light"
      />
    </div>
  );
}
