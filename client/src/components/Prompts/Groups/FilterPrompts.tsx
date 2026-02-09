import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { ListFilter, User, Share2 } from 'lucide-react';
import { SystemCategories } from 'librechat-data-provider';
import { Dropdown, FilterInput } from '@librechat/client';
import type { Option } from '~/common';
import { useLocalize, useCategories, useDebounce } from '~/hooks';
import { usePromptGroupsContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

export default function FilterPrompts({
  className = '',
  dropdownClassName = '',
}: {
  className?: string;
  dropdownClassName?: string;
}) {
  const localize = useLocalize();
  const { name, setName, hasAccess, promptGroups } = usePromptGroupsContext();
  const { categories } = useCategories({ className: 'h-4 w-4', hasAccess });
  const [searchTerm, setSearchTerm] = useState(name || '');
  const [categoryFilter, setCategory] = useRecoilState(store.promptsCategory);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const prevNameRef = useRef(name);

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

  // Sync searchTerm with name prop when it changes externally
  useEffect(() => {
    if (prevNameRef.current !== name) {
      prevNameRef.current = name;
      setSearchTerm(name || '');
    }
  }, [name]);

  useEffect(() => {
    setName(debouncedSearchTerm);
  }, [debouncedSearchTerm, setName]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const resultCount = promptGroups?.length ?? 0;
  const searchResultsAnnouncement = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return '';
    }
    return resultCount === 1 ? `${resultCount} result found` : `${resultCount} results found`;
  }, [debouncedSearchTerm, resultCount]);

  return (
    <div role="search" className={cn('flex w-full gap-2 text-text-primary', className)}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {searchResultsAnnouncement}
      </div>
      <Dropdown
        value={categoryFilter || SystemCategories.ALL}
        onChange={onSelect}
        options={filterOptions}
        className={cn('rounded-lg bg-transparent', dropdownClassName)}
        icon={<ListFilter className="h-4 w-4" />}
        label="Filter: "
        ariaLabel={localize('com_ui_filter_prompts')}
        iconOnly
      />
      <FilterInput
        inputId="prompts-filter"
        label={localize('com_ui_filter_prompts_name')}
        value={searchTerm}
        onChange={handleSearchChange}
        containerClassName="flex-1"
      />
    </div>
  );
}
