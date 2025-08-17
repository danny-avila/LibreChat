import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Constants } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';

type CostDisplay = {
  totalCost: string;
  totalCostRaw: number;
  primaryModel: string;
  totalTokens: number;
  lastUpdated: string | number | Date;
  conversationId?: string;
};

export default function ConversationCost() {
  const { t } = useTranslation();
  const { conversationId } = useParams();

  const { data } = useQuery<CostDisplay | null>({
    queryKey: ['conversationCost', conversationId],
    enabled: Boolean(conversationId && conversationId !== Constants.NEW_CONVO),
    queryFn: async () => {
      const res = await fetch(`/api/convos/${conversationId}/cost`, { credentials: 'include' });
      if (!res.ok) {
        return null;
      }
      return res.json();
    },
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const colorClass = useMemo(() => {
    const cost = data?.totalCostRaw ?? 0;
    if (cost < 0.01) return 'text-green-600 dark:text-green-400';
    if (cost < 0.1) return 'text-yellow-600 dark:text-yellow-400';
    if (cost < 1) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  }, [data?.totalCostRaw]);

  if (!conversationId || conversationId === Constants.NEW_CONVO) {
    return null;
  }

  if (!data || data.totalCostRaw === 0) {
    return (
      <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400" title={t('com_ui_conversation_cost')}>
        <span>💰</span>
        <span>$0.00</span>
      </div>
    );
  }

  const tooltipText = `${t('com_ui_conversation_cost')}: ${data.totalCost} | ${t('com_ui_primary_model')}: ${data.primaryModel} | ${t('com_ui_total_tokens')}: ${data.totalTokens.toLocaleString()} | ${t('com_ui_last_updated')}: ${new Date(data.lastUpdated).toLocaleTimeString()}`;

  return (
    <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-surface-hover" title={tooltipText}>
      <span className="text-text-tertiary">💰</span>
      <span className={`font-medium ${colorClass}`}>{data.totalCost}</span>
    </div>
  );
}
