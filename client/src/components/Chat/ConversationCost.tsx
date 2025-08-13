import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { TooltipAnchor } from '@librechat/client';
import { useConversationCost } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ConversationCost() {
  const { conversationId } = useParams();
  const localize = useLocalize();
  const latestMessage = useRecoilValue(store.latestMessageFamily(0));

  const {
    data: costData,
    isLoading,
    error,
    refetch,
  } = useConversationCost(conversationId !== Constants.NEW_CONVO ? conversationId : undefined, {
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Refetch when new message is added
  useEffect(() => {
    if (conversationId && conversationId !== Constants.NEW_CONVO && latestMessage) {
      const timeoutId = setTimeout(() => {
        refetch();
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [latestMessage?.messageId, conversationId, refetch, latestMessage]);

  // Always show something for debugging
  if (!conversationId || conversationId === Constants.NEW_CONVO) {
    return (
      <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400">
        <span>💰</span>
        <span>--</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500">
        <span>💰</span>
        <span>...</span>
      </div>
    );
  }

  if (error) {
    return null; // Don't show error state in UI
  }

  // Show $0.00 if no data or undefined cost
  if (
    !costData ||
    costData.totalCostRaw === undefined ||
    costData.totalCostRaw === null ||
    costData.totalCostRaw === 0
  ) {
    return (
      <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400">
        <span>💰</span>
        <span>$0.00</span>
      </div>
    );
  }

  const tooltipText = `${localize('com_ui_conversation_cost')}: ${costData.totalCost}
${localize('com_ui_primary_model')}: ${costData.primaryModel}
${localize('com_ui_total_tokens')}: ${costData.totalTokens.toLocaleString()}
${localize('com_ui_last_updated')}: ${new Date(costData.lastUpdated).toLocaleTimeString()}`;

  return (
    <TooltipAnchor description={tooltipText}>
      <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-surface-hover">
        <span className="text-text-tertiary">💰</span>
        <span className={`font-medium ${getCostColorClass(costData.totalCostRaw)}`}>
          {costData.totalCost}
        </span>
      </div>
    </TooltipAnchor>
  );
}

function getCostColorClass(cost: number): string {
  if (cost < 0.01) return 'text-green-600 dark:text-green-400';
  if (cost < 0.1) return 'text-yellow-600 dark:text-yellow-400';
  if (cost < 1.0) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}
