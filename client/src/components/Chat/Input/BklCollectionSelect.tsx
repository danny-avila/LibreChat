import React, { memo, useEffect, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown, FolderSearch } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { useRecoilState } from 'recoil';
import { useBadgeRowContext } from '~/Providers';
import { ephemeralAgentByConvoId } from '~/store';
import { MenuItemProps } from '~/common';
import { cn } from '~/utils';

type BklCollection = {
  name: string;
  display_name?: string;
  searchable?: boolean;
  active_default?: boolean;
  warnings?: string[];
};

const STORAGE_KEY = 'bkl_selected_collection';

function BklCollectionSelect() {
  const { conversationId } = useBadgeRowContext();
  const key = conversationId ?? Constants.NEW_CONVO;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(key));
  const [collections, setCollections] = useState<BklCollection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/bkl/api/collections?include_counts=true')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelled) {
          return;
        }
        const items = Array.isArray(data?.collections) ? data.collections : [];
        setCollections(items);
      })
      .catch(() => {
        if (!cancelled) {
          setCollections([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const searchable = collections.filter((item) => item.searchable !== false);
    return searchable.length > 0 ? searchable : collections;
  }, [collections]);

  useEffect(() => {
    if (ephemeralAgent?.bkl_collection || options.length === 0) {
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    const active = options.find((item) => item.active_default)?.name;
    const selected = stored || active || options[0]?.name;
    if (selected) {
      setEphemeralAgent((prev) => ({ ...(prev || {}), bkl_collection: selected }));
    }
  }, [ephemeralAgent?.bkl_collection, options, setEphemeralAgent]);

  const selected = ephemeralAgent?.bkl_collection ?? '';
  const selectedOption = options.find((item) => item.name === selected);
  const selectedLabel = selectedOption?.display_name || selectedOption?.name || '선택';
  const title = selectedOption?.warnings?.join('\n') || undefined;

  if (!isLoading && options.length === 0) {
    return null;
  }

  const dropdownItems = options.map((item): MenuItemProps => {
    const value = item.name;
    const label = item.display_name || item.name;
    const isSelected = value === selected;
    return {
      id: `bkl-db-${value}`,
      label: item.searchable === false ? `${label} · 준비 중` : label,
      icon: isSelected ? <Check className="icon-md" /> : <span className="icon-md" />,
      className: isSelected ? 'font-medium text-text-primary' : 'text-text-secondary',
      onClick: () => {
        localStorage.setItem(STORAGE_KEY, value);
        setEphemeralAgent((prev) => ({ ...(prev || {}), bkl_collection: value }));
      },
    };
  });

  const trigger = (
    <Ariakit.MenuButton
      disabled={isLoading || options.length === 0}
      aria-label="DB 선택"
      className={cn(
        'group inline-flex h-9 max-w-fit items-center justify-center gap-1.5 rounded-full border border-border-medium bg-transparent px-3 text-sm font-medium text-text-primary shadow-sm transition-all hover:bg-surface-hover hover:shadow-md active:shadow-inner',
        isOpen && 'bg-surface-hover',
      )}
    >
      <FolderSearch className="icon-md shrink-0 text-text-primary" aria-hidden="true" />
      <span className="hidden whitespace-nowrap md:block">DB</span>
      <span className="max-w-[116px] truncate text-xs font-normal text-text-secondary">
        {isLoading ? '불러오는 중' : selectedLabel}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
    </Ariakit.MenuButton>
  );

  return (
    <div title={title}>
      <DropdownPopup
        menuId="bkl-db-menu"
        className="z-[9999] overflow-visible"
        itemClassName="whitespace-nowrap"
        iconClassName="mr-0"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        modal={true}
        portal={true}
        unmountOnHide={true}
        trigger={trigger}
        items={dropdownItems}
      />
    </div>
  );
}

export default memo(BklCollectionSelect);
