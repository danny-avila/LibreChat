import React, { memo, useEffect, useMemo, useState } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilState } from 'recoil';
import { useBadgeRowContext } from '~/Providers';
import { ephemeralAgentByConvoId } from '~/store';

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
  if (!isLoading && options.length === 0) {
    return null;
  }

  return (
    <label className="flex max-w-[260px] items-center gap-2 rounded-full border border-border-light bg-surface-secondary px-3 py-1 text-xs text-text-primary">
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <span className="whitespace-nowrap text-text-secondary">Collection</span>
      <select
        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        value={selected}
        disabled={isLoading || options.length === 0}
        onChange={(event) => {
          const value = event.target.value;
          localStorage.setItem(STORAGE_KEY, value);
          setEphemeralAgent((prev) => ({ ...(prev || {}), bkl_collection: value }));
        }}
        title={options.find((item) => item.name === selected)?.warnings?.join('\n') || undefined}
      >
        {isLoading && <option value="">Loading...</option>}
        {options.map((item) => (
          <option key={item.name} value={item.name}>
            {item.display_name || item.name}
            {item.searchable === false ? ' (partial)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export default memo(BklCollectionSelect);
