import React, { useState } from 'react';
import { ListFilter, User } from 'lucide-react';
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

export function FilterItem({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <DropdownMenuItem className="cursor-pointer gap-2 text-text-secondary hover:bg-surface-tertiary focus:bg-surface-tertiary dark:focus:bg-surface-tertiary">
      {icon}
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

export function FilterMenu() {
  const localize = useLocalize();
  const { categories } = useCategories('h-4 w-4 mr-2');
  return (
    <DropdownMenuContent className="max-h-xl min-w-40 overflow-y-auto">
      <DropdownMenuGroup>
        <FilterItem
          label={localize('com_ui_all_proper')}
          icon={<ListFilter className="mr-2 h-4 w-4 text-text-primary" />}
        />
        <FilterItem
          label={localize('com_ui_my_prompts')}
          icon={<User className="mr-2 h-4 w-4 text-text-primary" />}
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
            />
          ))}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}

export default function GroupSidePanel({
  setName,
  className = '',
}: Pick<ReturnType<typeof usePromptGroupsNav>, 'setName'> & {
  className?: string;
}) {
  const localize = useLocalize();
  const [displayName, setDisplayName] = useState('');

  return (
    <div className={cn('flex gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 w-10">
            <ListFilter className="icon-sm" />
          </Button>
        </DropdownMenuTrigger>
        <FilterMenu />
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
