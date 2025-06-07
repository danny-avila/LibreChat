import { ListFilter, User, Share2 } from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { SystemCategories } from 'librechat-data-provider';
import { usePromptGroupsNav, useLocalize, useCategories } from '~/hooks';
import { Dropdown, AnimatedSearchInput } from '~/components/ui';
import type { Option } from '~/common';
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

    const categoryOptions = categories?.length
      ? [...categories]
      : [{ value: SystemCategories.NO_CATEGORY, label: localize('com_ui_no_category') }];

    return [...baseOptions, ...categoryOptions];
  }, [categories, localize]);

  const onSelect = useCallback(
    (value: string) => {
      setCategory(value === SystemCategories.ALL ? '' : value);
    },
    [setCategory],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisplayName(e.target.value);
      setName(e.target.value);
    },
    [setName],
  );

  return (
    <div className={cn('flex w-full gap-2 text-text-primary', className)}>
      <Dropdown
        value={categoryFilter || SystemCategories.ALL}
        onChange={onSelect}
        options={filterOptions}
        className="rounded-lg bg-transparent"
        icon={<ListFilter className="h-4 w-4" />}
        label="Filter: "
        ariaLabel={localize('com_ui_filter_prompts')}
        iconOnly
      />
      <AnimatedSearchInput
        value={displayName}
        onChange={handleSearchChange}
        placeholder={localize('com_ui_filter_prompts_name')}
      />
    </div>
  );
}
