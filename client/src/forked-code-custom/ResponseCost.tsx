import { memo, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { TMessage, TConversation, TModelSpec } from 'librechat-data-provider';
import { TooltipAnchor } from '../components/ui/Tooltip';
import { DollarSign } from 'lucide-react';
import { fetchModelInfo } from './litellmInfoAdapter';
import { cn } from '../utils';

// Extend TMessage type to include token properties
interface MessageWithTokens extends TMessage {
  tokenCount?: number;
  promptTokens?: number;
}

type ResponseCostProps = {
  message: TMessage;
  conversation: TConversation | null;
  isLast: boolean;
};

const ResponseCost = ({ message, conversation, isLast }: ResponseCostProps) => {
  const [cost, setCost] = useState<number | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{ totalTokens: number | null }>({ totalTokens: null });

  // Track if calculation is already complete
  const calculationComplete = useRef(false);

  // Check if message should display cost (assistant message with token data)
  const shouldShowCost = useCallback(() => {
    if (message.isCreatedByUser) {
      return false;
    }

    const msgWithTokens = message as MessageWithTokens;
    return (
      (typeof msgWithTokens.promptTokens === 'number' && msgWithTokens.promptTokens > 0) ||
      (typeof msgWithTokens.tokenCount === 'number' && msgWithTokens.tokenCount > 0)
    );
  }, [message]);

  // Helper function to get the correct model name for a message
  const getMessageModel = useCallback((msg: TMessage): string | undefined => {
    // Priority: direct model property
    if (msg.model) {
      return msg.model;
    }

    // Then check model_name
    if ((msg as any).model_name) {
      return (msg as any).model_name;
    }

    // Check metadata
    const msgWithMetadata = msg as any;
    if (msgWithMetadata.metadata && typeof msgWithMetadata.metadata === 'object') {
      if (msgWithMetadata.metadata.model) {
        return msgWithMetadata.metadata.model;
      }
    }

    return undefined;
  }, []);

  // Reset calculation when message or model changes
  useEffect(() => {
    calculationComplete.current = false;
  }, [message.messageId, message.model]);

  // Calculate message cost
  useEffect(() => {
    // Skip calculations if not needed
    if (!shouldShowCost() || !conversation?.endpoint) {
      return;
    }
    if (calculationComplete.current) {
      return;
    }

    let isMounted = true;

    const calculateCost = async () => {
      try {
        // Get the model for THIS specific message
        const messageModel = getMessageModel(message);

        // If this message doesn't have model information, we can't calculate cost
        if (!messageModel) {
          return;
        }

        // Check token count FROM THIS SPECIFIC MESSAGE
        const msgWithTokens = message as MessageWithTokens;
        const totalTokens = msgWithTokens.promptTokens || msgWithTokens.tokenCount || 0;

        // No tokens found for this message
        if (totalTokens <= 0) {
          if (isMounted) {
            calculationComplete.current = true;
          }
          return;
        }

        // Update token info for this message
        setTokenInfo({ totalTokens });

        // Get pricing data from LiteLLM for THIS MESSAGE'S model
        const modelInfoMap = await fetchModelInfo();

        // Direct lookup by model name
        const modelInfo = modelInfoMap[messageModel];

        if (!modelInfo) {
          if (isMounted) {
            calculationComplete.current = true;
          }
          return;
        }

        // Calculate cost using LiteLLM data
        const costPerToken = modelInfo.output_cost_per_token || 0;

        // Zero cost model (free)
        if (costPerToken === 0) {
          if (isMounted) {
            setCost(0);
            calculationComplete.current = true;
          }
          return;
        }

        // Calculate total cost
        const totalCost = totalTokens * costPerToken;

        if (isMounted) {
          setCost(totalCost);
          calculationComplete.current = true;
        }
      } catch (error) {
        console.error('Error calculating response cost:', error);
        if (isMounted) {
          calculationComplete.current = true;
        }
      }
    };

    calculateCost();

    return () => {
      isMounted = false;
    };
  }, [
    message.messageId,
    message.model,
    conversation?.endpoint,
    message,
    shouldShowCost,
    getMessageModel,
  ]);

  // Don't render anything for free or missing cost
  if (!shouldShowCost() || cost === null || cost <= 0) {
    return null;
  }

  // Format the cost with appropriate decimal places
  const formattedCost =
    cost < 0.01
      ? cost.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
      : cost < 0.1
        ? cost.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
        : cost.toFixed(2);

  // Create tooltip text
  const tooltipText = tokenInfo.totalTokens
    ? `Cost: $${formattedCost} (${tokenInfo.totalTokens} tokens)`
    : `Cost: $${formattedCost}`;

  return (
    <button
      className={cn(
        'ml-0 flex items-center gap-1.5 rounded-md p-1 text-sm hover:bg-gray-100 hover:text-gray-500 focus:opacity-100 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
        !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
      )}
      type="button"
      title={tooltipText}
    >
      <TooltipAnchor
        description={tooltipText}
        side="top"
        className="flex cursor-pointer items-center"
      >
        <DollarSign size={15} className="hover:text-gray-500 dark:hover:text-gray-200" />
        <span>{formattedCost}</span>
      </TooltipAnchor>
    </button>
  );
};

export default memo(ResponseCost);
