import { useEffect, useMemo } from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import { HoverCard, HoverCardContent, HoverCardTrigger, Button, Switch } from '@librechat/client';
import { AlertTriangle, RefreshCw, DollarSign, TrendingDown, Zap } from 'lucide-react';
import {
  openRouterCreditsState,
  openRouterCreditsLoadingState,
  openRouterCreditsErrorState,
  openRouterAutoRouterEnabledState,
} from '~/store/openrouter';
import { useOpenRouterCredits } from '~/hooks/Credits';
import store from '~/store';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

interface OpenRouterCreditsProps {
  className?: string;
  compact?: boolean;
}

export default function OpenRouterCredits({ className, compact = false }: OpenRouterCreditsProps) {
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const credits = useRecoilValue(openRouterCreditsState);
  const isLoading = useRecoilValue(openRouterCreditsLoadingState);
  const error = useRecoilValue(openRouterCreditsErrorState);
  const [autoRouterEnabled, setAutoRouterEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
  const { fetchCredits, manualRefresh, isManualRefreshing } = useOpenRouterCredits();
  const localize = useLocalize();

  // Only show for OpenRouter endpoint
  const endpoint = conversation?.endpoint;
  const isOpenRouter = endpoint === EModelEndpoint.openrouter;

  // Fetch credits on mount and when endpoint changes
  useEffect(() => {
    if (isOpenRouter) {
      fetchCredits();
    }
  }, [isOpenRouter, fetchCredits]);

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
          <span className="text-sm font-normal text-text-secondary">Credits:</span>
          {compactContent}
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-border-light" />

        {/* Auto Router Toggle */}
        <div className="flex items-center gap-2">
          <HoverCard>
            <HoverCardTrigger asChild>
              <button className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
                <Zap className={cn('h-4 w-4', autoRouterEnabled && 'text-green-500')} />
                <span className="hidden sm:inline">
                  {localize('com_endpoint_openrouter_auto_router')}
                </span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent>
              <p className="text-sm">
                {localize('com_endpoint_openrouter_auto_router_tooltip')}
              </p>
            </HoverCardContent>
          </HoverCard>
          <Switch
            id="autoRouter"
            checked={autoRouterEnabled}
            onCheckedChange={setAutoRouterEnabled}
            className="h-4 w-8"
            aria-label={localize('com_endpoint_openrouter_auto_router')}
          />
        </div>
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
