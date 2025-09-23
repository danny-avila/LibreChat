import React, { useEffect, useMemo, useCallback } from 'react';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import { EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger, Button, Switch } from '@librechat/client';
import { AlertTriangle, RefreshCw, DollarSign, TrendingDown, Zap, Shield } from 'lucide-react';
// Import all openrouter atoms directly to avoid circular dependency
import {
  openRouterCreditsState,
  openRouterCreditsLoadingState,
  openRouterCreditsErrorState,
  openRouterAutoRouterEnabledState,
  openRouterActualModelState,
  openRouterZDREnabledState,
} from '~/store/openrouter';
// Import conversationByIndex directly from families to avoid circular dependency
import families from '~/store/families';
import { DynamicProviderIcon } from '../Endpoints/DynamicProviderIcon';
import { useOpenRouterCredits } from '~/hooks/Credits';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

interface OpenRouterCreditsProps {
  className?: string;
  compact?: boolean;
}

// Extract provider from model ID (e.g., "google/gemini-2.0-flash-exp" -> "google")
const getProviderFromModel = (model?: string | null): string | null => {
  if (!model || !model.includes('/')) {
    return null;
  }
  return model.split('/')[0].toLowerCase();
};

export default function OpenRouterCredits({ className, compact = false }: OpenRouterCreditsProps) {
  const queryClient = useQueryClient();
  const conversation = useRecoilValue(families.conversationByIndex(0));
  const credits = useRecoilValue(openRouterCreditsState);
  const isLoading = useRecoilValue(openRouterCreditsLoadingState);
  const error = useRecoilValue(openRouterCreditsErrorState);
  const [autoRouterEnabled, setAutoRouterEnabled] = useRecoilState(
    openRouterAutoRouterEnabledState,
  );
  const [zdrEnabled, setZDREnabled] = useRecoilState(openRouterZDREnabledState);
  const actualModel = useRecoilValue(openRouterActualModelState);

  // Debug logging
  React.useEffect(() => {
    console.log('[OpenRouterCredits] Debug state:', {
      autoRouterEnabled,
      actualModel,
      shouldShowModel: !!(autoRouterEnabled && actualModel),
      actualModelType: typeof actualModel,
      actualModelValue: actualModel,
      actualModelNull: actualModel === null,
      actualModelUndefined: actualModel === undefined,
      actualModelEmpty: actualModel === '',
      endpoint: conversation?.endpoint,
      conversationModel: conversation?.model,
      modelOptions: conversation?.modelOptions,
      conversationId: conversation?.conversationId,
    });
  }, [autoRouterEnabled, actualModel, conversation]);
  const setActualModel = useSetRecoilState(openRouterActualModelState);
  const setConversation = useSetRecoilState(families.conversationByIndex(0));
  const { fetchCredits, manualRefresh, isManualRefreshing } = useOpenRouterCredits();
  const localize = useLocalize();

  // Only show for OpenRouter endpoint
  const isOpenRouter = conversation?.endpoint === EModelEndpoint.openrouter;

  // Debug the endpoint
  React.useEffect(() => {
    console.log('[OpenRouterCredits] Endpoint check:', {
      endpoint: conversation?.endpoint,
      isOpenRouter,
      EModelEndpointValue: EModelEndpoint.openrouter,
      exactMatch: conversation?.endpoint === EModelEndpoint.openrouter,
    });
  }, [conversation?.endpoint, isOpenRouter]);

  // Handle auto-router toggle with conversation sync
  const handleAutoRouterChange = useCallback(
    (checked: boolean) => {
      setAutoRouterEnabled(checked);

      // Clear actual model when disabling auto-router
      if (!checked) {
        setActualModel(null);
      }

      // Also update the current conversation if it's OpenRouter
      if (isOpenRouter && conversation) {
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            // When enabling auto-router, set model to 'openrouter/auto'
            // When disabling, keep current model (unless it's 'openrouter/auto')
            model: checked ? 'openrouter/auto' : prev.model === 'openrouter/auto' ? '' : prev.model,
            // Set autoRouter in modelOptions for backend
            modelOptions: {
              ...prev.modelOptions,
              autoRouter: checked,
            },
          } as typeof prev;
        });
      }
    },
    [setAutoRouterEnabled, setActualModel, setConversation, isOpenRouter, conversation],
  );

  // Handle ZDR toggle with conversation sync
  const handleZDRChange = useCallback(
    (checked: boolean) => {
      setZDREnabled(checked);

      // Also update the current conversation if it's OpenRouter
      if (isOpenRouter && conversation) {
        setConversation((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            // Set zdr in modelOptions for backend
            modelOptions: {
              ...prev.modelOptions,
              zdr: checked,
            },
          } as typeof prev;
        });
      }
    },
    [setZDREnabled, setConversation, isOpenRouter, conversation],
  );

  // Sync the toggle states with conversation on mount
  // Check if model is 'openrouter/auto' to determine toggle state
  // Also check autoRouter and zdr fields for explicit state
  useEffect(() => {
    if (isOpenRouter) {
      // Sync Auto-Router state
      if (conversation?.model === 'openrouter/auto') {
        setAutoRouterEnabled(true);
      } else if (conversation?.modelOptions && 'autoRouter' in conversation.modelOptions) {
        setAutoRouterEnabled(conversation.modelOptions.autoRouter || false);
      } else if (conversation?.model && conversation.model !== 'openrouter/auto') {
        setAutoRouterEnabled(false);
      }

      // Sync ZDR state
      if (conversation?.modelOptions && 'zdr' in conversation.modelOptions) {
        setZDREnabled(conversation.modelOptions.zdr || false);
      }
    }
  }, [isOpenRouter, conversation?.model, conversation, setAutoRouterEnabled, setZDREnabled]);

  // Fetch credits on mount and when endpoint changes
  useEffect(() => {
    if (isOpenRouter) {
      fetchCredits();
    }
  }, [isOpenRouter, fetchCredits]);

  // Clear actual model when switching to a different conversation
  // But check if the latest message has a model (for existing conversations)
  const prevConversationIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (conversation?.conversationId && conversation.conversationId !== prevConversationIdRef.current) {
      // Only clear if we're actually switching to a different conversation
      if (prevConversationIdRef.current !== null && conversation.conversationId !== 'new') {
        setActualModel(null);

        // If auto-router is enabled, try to get the model from the latest message
        if (autoRouterEnabled && conversation.endpoint === EModelEndpoint.openrouter) {
          // Try to get the model from the latest assistant message using React Query
          const messages = queryClient.getQueryData([QueryKeys.messages, conversation.conversationId]);
          console.log('[OpenRouterCredits] Checking messages from React Query:', messages);
          if (Array.isArray(messages) && messages.length > 0) {
            // Find the last assistant message
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i];
              if (msg.isCreatedByUser === false && msg.model) {
                console.log('[OpenRouterCredits] Found model in message history:', msg.model);
                setActualModel(msg.model);
                break;
              }
            }
          }
        }
      }
      prevConversationIdRef.current = conversation.conversationId;
    }
  }, [conversation?.conversationId, conversation?.endpoint, autoRouterEnabled, setActualModel, queryClient]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!isOpenRouter) return;

    const interval = setInterval(
      () => {
        fetchCredits();
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [isOpenRouter, fetchCredits]);

  const balance = credits?.balance ?? 0;
  const currency = credits?.currency ?? 'USD';
  const status: 'loading' | 'error' | 'ready' = useMemo(() => {
    if (error) {
      return 'error';
    }
    if (isLoading || credits?.optimistic) {
      return 'loading';
    }
    return 'ready';
  }, [credits?.optimistic, error, isLoading]);

  const formatCurrency = (amount: number) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const warningLevel: 'critical' | 'warning' | 'normal' = useMemo(() => {
    if (balance < 0.5) return 'critical';
    if (balance < 1.0) return 'warning';
    return 'normal';
  }, [balance]);

  const warningColorClass = useMemo(() => {
    if (warningLevel === 'critical') {
      return 'text-red-500 dark:text-red-400';
    }
    if (warningLevel === 'warning') {
      return 'text-orange-500 dark:text-orange-400';
    }
    return 'text-green-600 dark:text-green-400';
  }, [warningLevel]);

  const warningIcon = useMemo(() => {
    if (warningLevel === 'critical') {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    if (warningLevel === 'warning') {
      return <TrendingDown className="h-4 w-4 text-orange-500" />;
    }
    return null;
  }, [warningLevel]);

  const handleRefresh = async () => {
    await manualRefresh();
  };

  if (!isOpenRouter) {
    return null;
  }

  if (compact) {
    const compactTitle = error
      ? `${localize('com_endpoint_openrouter_error_label')}: ${error}`
      : `${localize('com_endpoint_openrouter_compact_title')} ${formatCurrency(balance)}${
          credits?.optimistic ? ` ${localize('com_endpoint_openrouter_updating')}` : ''
        }\n${localize('com_endpoint_openrouter_tooltip_refresh')}`;

    let compactContent: JSX.Element;
    if (status === 'loading') {
      compactContent = <RefreshCw className="h-3 w-3 animate-spin" />;
    } else if (status === 'error') {
      compactContent = <AlertTriangle className="h-3 w-3 text-red-500" />;
    } else {
      compactContent = (
        <span className={cn('font-medium', warningColorClass)}>{formatCurrency(balance)}</span>
      );
    }

    return (
      <div className={cn('flex items-center gap-2', className)}>
        {/* Credits Display */}
        <button
          onClick={handleRefresh}
          disabled={isManualRefreshing}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
            'hover:bg-gray-100 dark:hover:bg-gray-700',
            isManualRefreshing && 'cursor-not-allowed opacity-50',
            credits?.optimistic && 'opacity-75',
          )}
          title={compactTitle}
        >
          <span className="text-sm font-normal text-text-secondary">
            {localize('com_endpoint_openrouter_label')}:
          </span>
          {compactContent}
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border-light" />

        {/* Auto Router Toggle */}
        <div className="flex items-center gap-2">
          <HoverCard>
            <HoverCardTrigger asChild>
              <button className="flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
                <Zap className={cn('h-4 w-4', autoRouterEnabled && 'text-green-500')} />
                <span className="hidden sm:inline">
                  {localize('com_endpoint_openrouter_auto_router')}
                </span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent>
              <p className="text-sm">{localize('com_endpoint_openrouter_auto_router_tooltip')}</p>
            </HoverCardContent>
          </HoverCard>
          <Switch
            id="autoRouter"
            checked={autoRouterEnabled}
            onCheckedChange={handleAutoRouterChange}
            className="h-4 w-8"
            aria-label={localize('com_endpoint_openrouter_auto_router')}
          />
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border-light" />

        {/* ZDR Toggle */}
        <div className="flex items-center gap-2">
          <HoverCard>
            <HoverCardTrigger asChild>
              <button className="flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
                <Shield className={cn('h-4 w-4', zdrEnabled && 'text-amber-500')} />
                <span className="hidden sm:inline">ZDR</span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <p className="text-sm font-medium">{localize('com_endpoint_openrouter_zdr_label')}</p>
              <p className="mt-1 text-sm">{localize('com_endpoint_openrouter_zdr_help')}</p>
            </HoverCardContent>
          </HoverCard>
          <Switch
            id="zdr"
            checked={zdrEnabled}
            onCheckedChange={handleZDRChange}
            className="h-4 w-8"
            aria-label={localize('com_endpoint_openrouter_zdr_label')}
          />
        </div>

        {/* Display actual model used when auto-router is enabled */}
        {autoRouterEnabled && actualModel ? (
          <>
            <div className="h-5 w-px bg-border-light" />
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              {(() => {
                const provider = getProviderFromModel(actualModel);
                if (provider) {
                  return (
                    <>
                      <DynamicProviderIcon provider={provider} size={14} />
                      <span className="truncate max-w-[150px]" title={actualModel}>
                        {actualModel.split('/')[1] || actualModel}
                      </span>
                    </>
                  );
                }
                return (
                  <span className="truncate max-w-[150px]" title={actualModel}>
                    {actualModel}
                  </span>
                );
              })()}
            </div>
          </>
        ) : autoRouterEnabled ? (
          <>
            <div className="h-5 w-px bg-border-light" />
            <span className="text-xs text-text-secondary ml-2 animate-pulse">
              waiting for model...
            </span>
          </>
        ) : null}
      </div>
    );
  }

  // Full view for settings panel
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between rounded-lg border bg-surface-primary p-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-medium">{localize('com_endpoint_openrouter_label')}</span>
          {warningIcon}
        </div>

        <div className="flex items-center gap-2">
          {status === 'loading' && <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />}
          {status === 'error' && (
            <HoverCard>
              <HoverCardTrigger>
                <span className="cursor-help text-sm text-red-500">
                  {localize('com_endpoint_openrouter_error_label')}
                </span>
              </HoverCardTrigger>
              <HoverCardContent>
                <p className="text-sm">{error}</p>
              </HoverCardContent>
            </HoverCard>
          )}
          {status === 'ready' && (
            <span
              className={cn(
                'text-lg font-semibold',
                warningColorClass,
                credits?.optimistic && 'opacity-75',
              )}
            >
              {formatCurrency(balance)}
              {credits?.optimistic && (
                <span className="ml-1 text-xs text-gray-500">
                  {localize('com_endpoint_openrouter_updating')}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Refresh Button - Only in full mode */}
      {!compact && (
        <Button
          size="sm"
          variant="ghost"
          onClick={manualRefresh}
          disabled={isManualRefreshing || isLoading}
          className="h-8 w-8 p-0"
          title={localize('com_endpoint_openrouter_refresh')}
        >
          <RefreshCw className={cn('h-4 w-4', isManualRefreshing && 'animate-spin')} />
        </Button>
      )}

      {/* Warning message */}
      {status !== 'error' && warningLevel !== 'normal' && (
        <div
          className={cn(
            'rounded-md p-2 text-xs',
            warningLevel === 'critical'
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
          )}
        >
          {warningLevel === 'critical'
            ? localize('com_endpoint_openrouter_warning_critical')
            : localize('com_endpoint_openrouter_warning_low')}
        </div>
      )}
    </div>
  );
}
