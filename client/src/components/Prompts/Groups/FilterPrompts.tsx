import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { ListFilter, User, Share2 } from 'lucide-react';
import { SystemCategories } from 'librechat-data-provider';
import { Dropdown, AnimatedSearchInput } from '@librechat/client';
import type { Option } from '~/common';
import { useLocalize, useCategories } from '~/hooks';
import { usePromptGroupsContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

export default function FilterPrompts({ className = '' }: { className?: string }) {
  const localize = useLocalize();
  const { setName } = usePromptGroupsContext();
  const { categories } = useCategories('h-4 w-4');
  const [displayName, setDisplayName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [categoryFilter, setCategory] = useRecoilState(store.promptsCategory);

  const filterOptions = useMemo(() => {
    const baseOptions: Option[] = [
      {
        value: SystemCategories.ALL,
        label: localize('com_ui_all_proper'),
        icon: <ListFilter className="h-4 w-4 text-text-primary" />,
      },
      {
        value: SystemCategories.MY_PROMPTS,
        label: localize('com_ui_my_prompts'),
        icon: <User className="h-4 w-4 text-text-primary" />,
      },
      {
        value: SystemCategories.SHARED_PROMPTS,
        label: localize('com_ui_shared_prompts'),
        icon: <Share2 className="h-4 w-4 text-text-primary" />,
      },
      { divider: true, value: null },
    ];

    const categoryOptions = categories
      ? [...categories]
      : [
          {
            value: SystemCategories.NO_CATEGORY,
            label: localize('com_ui_no_category'),
          },
        ];

    return [...baseOptions, ...categoryOptions];
  }, [categories, localize]);

  const onSelect = useCallback(
    (value: string) => {
      if (value === SystemCategories.ALL) {
        setCategory('');
      } else {
        setCategory(value);
      }
    },
    [setCategory],
  );

  useEffect(() => {
    setIsSearching(true);
    const timeout = setTimeout(() => {
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [displayName]);

  return (
    <div className={cn('flex w-full gap-2 text-text-primary', className)}>
      <Dropdown
        value={categoryFilter || SystemCategories.ALL}
        onChange={onSelect}
        options={filterOptions}
        className="bg-transparent"
        icon={<ListFilter className="h-4 w-4" />}
        label="Filter: "
        ariaLabel={localize('com_ui_filter_prompts')}
        iconOnly
      />
      <AnimatedSearchInput
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value);
          setName(e.target.value);
        }}
        isSearching={isSearching}
        placeholder={localize('com_ui_filter_prompts_name')}
      />
    </div>
  );
}
