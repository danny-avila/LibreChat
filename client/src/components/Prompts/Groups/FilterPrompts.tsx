import { ListFilter, User, Share2 } from 'lucide-react';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { SystemCategories } from 'librechat-data-provider';
import type { Option, OptionWithIcon } from '~/common';
import { usePromptGroupsNav, useLocalize, useCategories } from '~/hooks';
import { Button, Dropdown, AnimatedSearchInput } from '~/components/ui';
import { cn } from '~/utils';
import store from '~/store';

export default function FilterPrompts({
  setName,
  className = '',
}: Pick<ReturnType<typeof usePromptGroupsNav>, 'setName'> & {
  className?: string;
}) {
  const localize = useLocalize();
  const [displayName, setDisplayName] = useState('');
  const setCategory = useSetRecoilState(store.promptsCategory);
  const categoryFilter = useRecoilValue(store.promptsCategory);
  const { categories } = useCategories('h-4 w-4');
  const [isSearching, setIsSearching] = useState(false);

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
        className=""
        icon={<ListFilter className="h-4 w-4" />}
        label="Filter: "
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
