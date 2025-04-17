import { memo } from 'react';
import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { User, Server, Gift, Target } from 'lucide-react';
import { TooltipAnchor } from '../components/ui/Tooltip';
import { useModelPricingInfo } from './litellmInfoAdapter';
import { useNewModelCheck } from './openRouterAdapter';

/**
 * Format token count for display (e.g. 128000 → 128K)
 */
const formatTokenCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  }
  return count.toString();
};

/**
 * Price badge component for displaying input and output prices
 * Memoized to prevent unnecessary re-renders
 */
const PriceBadge = memo(({
  type,
  price,
}: {
  type: 'input' | 'output';
  price: number;
}) => {
  const isInput = type === 'input';

  // Display the price value directly without further conversion
  // since it's already per million tokens
  const formattedPrice = price.toFixed(price >= 100 ? 0 : price >= 10 ? 1 : 2);
  const tooltipText = `$${formattedPrice} per 1 million tokens`;

  // Extract the content into a variable to avoid literal string ESLint error
  const priceText = `$${formattedPrice}/1M`;

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: '76px' }}
      >
        {isInput ? (
          <User size={12} className="text-text-primary" strokeWidth={1.5} />
        ) : (
          <Server size={12} className="text-text-primary" strokeWidth={1.5} />
        )}
        <span className="text-[10px] text-text-primary">
          {priceText}
        </span>
      </div>
    </TooltipAnchor>
  );
});

/**
 * Free badge component for free models
 * Memoized to prevent unnecessary re-renders
 */
const FreeBadge = memo(() => {
  // Extract the content into a variable to avoid literal string ESLint error
  const freeText = 'Currently free';

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
      style={{ minWidth: '76px' }}
    >
      <Gift size={14} className="text-orange-400" strokeWidth={1.5} />
      <span className="text-[10px] text-text-primary">
        {freeText}
      </span>
    </div>
  );
});

/**
 * New badge component for new models
 * Memoized to prevent unnecessary re-renders
 */
const NewBadge = memo(({
  createdAt,
}: {
  createdAt?: number | null;
}) => {
  const newText = 'NEW';

  // Generate tooltip text with creation date if available
  let tooltipText = 'Recently added model';

  if (createdAt) {
    // Convert Unix timestamp to Date object (multiply by 1000 as OpenRouter uses seconds)
    const creationDate = new Date(createdAt * 1000);

    // Format date to local string
    const formattedDate = creationDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // Calculate days since creation
    const daysSince = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));

    // Create tooltip text
    tooltipText = `Released ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago on ${formattedDate}`;
  }

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-sidebar/20 border-[0.5px] border-[#ffb525f7] shadow-[0px_1px_4px_#ffae1082,inset_0px_-2px_10px_#ffb52575] dark:bg-[hsl(320,20%,2.9%)] dark:border-amber-200/80 dark:shadow-[0px_1px_4px_rgba(186,130,21,0.32),inset_0px_-2px_10px_rgba(186,130,21,0.43)] transition-all duration-300">
        <span className="text-[10px] font-semibold text-color-heading">{newText}</span>
      </div>
    </TooltipAnchor>
  );
});

/**
 * Context window badge component for displaying max tokens
 * Memoized to prevent unnecessary re-renders
 */
const ContextBadge = memo(({
  tokens,
}: {
  tokens: number;
}) => {
  const formattedTokens = formatTokenCount(tokens);
  const tooltipText = 'Max Context Tokens';

  return (
    <TooltipAnchor
      description={tooltipText}
      side="top"
      className="cursor-pointer"
    >
      <div
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-surface-chat border border-border-medium"
        style={{ minWidth: '61px' }}
      >
        <Target size={12} className="text-text-primary" strokeWidth={1.5} />
        <span className="text-[10px] text-text-primary">
          {formattedTokens}
        </span>
      </div>
    </TooltipAnchor>
  );
});

/**
 * Pre-memoized badges component to keep ModelSpecItem clean
 */
export const ModelBadges = memo(({
  spec,
  inputPrice: passedInputPrice,
  outputPrice: passedOutputPrice,
  showPricing: passedShowPricing,
  isFree: passedIsFree,
  maxTokens: passedMaxTokens,
  disabled: passedDisabled,
}: {
  spec?: TModelSpec;
  inputPrice?: number | null;
  outputPrice?: number | null;
  showPricing?: boolean;
  isFree?: boolean;
  maxTokens?: number | null;
  disabled?: boolean;
}) => {
  // Get pricing data from the hook in litellmInfoAdapter.ts
  const pricingInfo = useModelPricingInfo(spec ?? {} as TModelSpec);
  const modelName = spec?.preset?.model || '';

  // Get provider information from the model's endpoint
  const endpoint = spec?.preset?.endpoint || '';

  // Check if model is new using OpenRouter data
  const { isNew, createdAt } = useNewModelCheck(modelName, endpoint);

  // Use passed props if available, otherwise use hook data
  const inputPrice = passedInputPrice ?? pricingInfo?.inputPrice ?? null;
  const outputPrice = passedOutputPrice ?? pricingInfo?.outputPrice ?? null;
  const showPricing = passedShowPricing ?? pricingInfo?.showPricing ?? true;
  const isFree = passedIsFree ?? pricingInfo?.isFree ?? false;
  const maxTokens = passedMaxTokens ?? pricingInfo?.maxTokens ?? null;
  const disabled = passedDisabled ?? pricingInfo?.disabled ?? false;

  // If badges are explicitly disabled, show nothing
  if (disabled) {
    return null;
  }

  // Don't show anything if no pricing info and no token info
  if (!showPricing && !maxTokens && !isFree) {
    return null;
  }

  // Check if both input and output prices are 0 (free model)
  const isZeroPriced = inputPrice === 0 && outputPrice === 0;
  const shouldShowFree = isFree || isZeroPriced;

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mt-1">
      {isNew && <NewBadge createdAt={createdAt} />}

      {shouldShowFree && (
        <FreeBadge />
      )}
      {showPricing && !shouldShowFree && inputPrice !== null && (
        <PriceBadge type="input" price={inputPrice} />
      )}
      {showPricing && !shouldShowFree && outputPrice !== null && (
        <PriceBadge type="output" price={outputPrice} />
      )}
      {maxTokens !== null && maxTokens !== undefined && (
        <ContextBadge tokens={maxTokens} />
      )}
    </div>
  );
});