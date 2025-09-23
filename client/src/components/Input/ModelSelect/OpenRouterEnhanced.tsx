import React, { useMemo, useEffect } from 'react';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { SelectDropDown } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Shield,
  Info,
  Check,
} from 'lucide-react';
import type { TModelSelectProps } from '~/common';
import SelectDropDownPop from '~/components/Input/ModelSelect/SelectDropDownPop';
import {
  Button,
  Label,
  Switch,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@librechat/client';
import {
  openRouterModelsListState,
  openRouterModelsDerivedSelector,
  openRouterSortKeyState,
  openRouterSortDirState,
  openRouterFilterNoTrainState,
} from '~/store/openrouter';
import { cn, cardStyle } from '~/utils';
import useAuthContext from '~/hooks/Authentication/useAuthContext';
import { useLocalize } from '~/hooks';

export default function OpenRouterEnhanced({
  conversation,
  setOption,
  models,
  showAbove,
  popover = false,
}: TModelSelectProps) {
  const { token } = useAuthContext();
  const localize = useLocalize();

  // Recoil state for sorting and filtering
  const setModelsList = useSetRecoilState(openRouterModelsListState);
  const derivedModels = useRecoilValue(openRouterModelsDerivedSelector);
  const [sortKey, setSortKey] = useRecoilState(openRouterSortKeyState);
  const [sortDir, setSortDir] = useRecoilState(openRouterSortDirState);
  const [filterNoTrain, setFilterNoTrain] = useRecoilState(openRouterFilterNoTrainState);

  // Fetch OpenRouter models with pricing
  const { data: openRouterModels } = useQuery({
    queryKey: ['openRouterModels'],
    queryFn: async () => {
      const response = await fetch('/api/endpoints/openrouter/models', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch OpenRouter models');
      }
      return response.json();
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  // Update models list when data is fetched
  useEffect(() => {
    if (openRouterModels?.data && Array.isArray(openRouterModels.data)) {
      setModelsList(openRouterModels.data);
    }
  }, [openRouterModels, setModelsList]);

  // Get available model IDs from derived models
  const availableModels = useMemo(() => {
    if (derivedModels.length > 0) {
      return derivedModels.map((model) => model.id).filter(Boolean);
    }
    return models || [];
  }, [models, derivedModels]);

  const Menu = popover ? SelectDropDownPop : SelectDropDown;
  const currentModel = conversation?.model ?? '';

  // Toggle sort direction
  const toggleSortDir = () => {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // Check if current model is hidden by filter
  const isCurrentModelHidden = useMemo(() => {
    if (!filterNoTrain || !currentModel) return false;
    const { mayTrainOnUserData } = require('~/utils/openRouterPrivacy');
    return mayTrainOnUserData(currentModel) && currentModel !== 'openrouter/auto';
  }, [currentModel, filterNoTrain]);

  return (
    <div className="flex flex-col gap-2">
      {/* Sorting and Filtering Controls */}
      <div className="flex items-center gap-2 px-2">
        {/* Sort Control */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              title={localize('com_ui_sort_models')}
            >
              <ArrowUpDown className="h-3 w-3" />
              <span className="hidden sm:inline">
                {sortKey === 'provider' ? localize('com_ui_provider') : localize('com_ui_name')}
              </span>
              {sortDir === 'asc' ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onClick={() => {
                setSortKey('provider');
                setSortDir('asc');
              }}
              className="gap-2"
            >
              {sortKey === 'provider' && sortDir === 'asc' && <Check className="h-3 w-3" />}
              <span className={cn(sortKey !== 'provider' || sortDir !== 'asc' ? 'ml-5' : '')}>
                {localize('com_ui_provider')} A→Z
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSortKey('provider');
                setSortDir('desc');
              }}
              className="gap-2"
            >
              {sortKey === 'provider' && sortDir === 'desc' && <Check className="h-3 w-3" />}
              <span className={cn(sortKey !== 'provider' || sortDir !== 'desc' ? 'ml-5' : '')}>
                {localize('com_ui_provider')} Z→A
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setSortKey('name');
                setSortDir('asc');
              }}
              className="gap-2"
            >
              {sortKey === 'name' && sortDir === 'asc' && <Check className="h-3 w-3" />}
              <span className={cn(sortKey !== 'name' || sortDir !== 'asc' ? 'ml-5' : '')}>
                {localize('com_ui_name')} A→Z
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSortKey('name');
                setSortDir('desc');
              }}
              className="gap-2"
            >
              {sortKey === 'name' && sortDir === 'desc' && <Check className="h-3 w-3" />}
              <span className={cn(sortKey !== 'name' || sortDir !== 'desc' ? 'ml-5' : '')}>
                {localize('com_ui_name')} Z→A
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Privacy Filter */}
        <div className="flex items-center gap-2">
          <Switch
            id="privacy-filter"
            checked={filterNoTrain}
            onCheckedChange={setFilterNoTrain}
            className="h-4 w-7"
            aria-label={localize('com_ui_privacy_filter')}
          />
          <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>
              <Label
                htmlFor="privacy-filter"
                className="flex cursor-pointer items-center gap-1 text-xs"
              >
                <Shield className="h-3 w-3" />
                <span className="hidden sm:inline">{localize('com_ui_privacy_mode')}</span>
                <Info className="h-3 w-3 text-muted-foreground" />
              </Label>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="bottom">
              <div className="space-y-2">
                <p className="text-sm font-semibold">{localize('com_ui_privacy_filter')}</p>
                <p className="text-xs text-muted-foreground">
                  {localize('com_ui_privacy_filter_desc')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {localize('com_ui_privacy_filter_note')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {/* Warning if selected model is hidden */}
      {isCurrentModelHidden && (
        <div className="mx-2 flex items-center gap-2 rounded-md bg-yellow-50 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          <Info className="h-3 w-3" />
          <span>{localize('com_ui_model_hidden_by_filter')}</span>
          <button
            className="ml-auto text-xs underline hover:no-underline"
            onClick={() => setFilterNoTrain(false)}
          >
            {localize('com_ui_show_anyway')}
          </button>
        </div>
      )}

      {/* Model Selector Dropdown */}
      <Menu
        value={currentModel}
        setValue={setOption('model')}
        availableValues={availableModels}
        showAbove={showAbove}
        showLabel={false}
        className={cn(
          cardStyle,
          'z-50 flex h-[40px] w-full min-w-56 flex-none items-center justify-center px-4 ring-0 hover:cursor-pointer',
        )}
      />
    </div>
  );
}