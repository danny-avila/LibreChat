import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ArrowIcon } from '@librechat/client';
import { TModelCosts, TMessage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

interface CostBarProps {
  messagesTree: TMessage[];
  modelCosts: TModelCosts;
  showCostBar: boolean;
}

export default function CostBar({ messagesTree, modelCosts, showCostBar }: CostBarProps) {
  const localize = useLocalize();
  const showCostTracking = useRecoilValue(store.showCostTracking);

  const conversationCosts = useMemo(() => {
    if (!modelCosts?.modelCostTable || !messagesTree) {
      return null;
    }

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalPromptUSD = 0;
    let totalCompletionUSD = 0;

    const flattenMessages = (messages: TMessage[]) => {
      const flattened: TMessage[] = [];
      messages.forEach((message: TMessage) => {
        flattened.push(message);
        if (message.children && message.children.length > 0) {
          flattened.push(...flattenMessages(message.children));
        }
      });
      return flattened;
    };

    const allMessages = flattenMessages(messagesTree);

    allMessages.forEach((message) => {
      if (!message.tokenCount) {
        return null;
      }

      const modelToUse = message.isCreatedByUser ? message.targetModel : message.model;

      const modelPricing = modelCosts.modelCostTable[modelToUse];
      if (message.isCreatedByUser) {
        totalPromptTokens += message.tokenCount;
        totalPromptUSD += (message.tokenCount / 1000000) * modelPricing.prompt;
      } else {
        totalCompletionTokens += message.tokenCount;
        totalCompletionUSD += (message.tokenCount / 1000000) * modelPricing.completion;
      }
    });

    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalUSD = totalPromptUSD + totalCompletionUSD;

    return {
      totals: {
        prompt: { tokenCount: totalPromptTokens, usd: totalPromptUSD },
        completion: { tokenCount: totalCompletionTokens, usd: totalCompletionUSD },
        total: { tokenCount: totalTokens, usd: totalUSD },
      },
    };
  }, [modelCosts, messagesTree]);

  if (!showCostTracking || !conversationCosts || !conversationCosts.totals) {
    return null;
  }

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-md px-4 text-xs text-muted-foreground transition-all duration-300 ease-in-out',
        showCostBar ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div>
            <ArrowIcon direction="up" />
            {localize('com_ui_token_abbreviation', {
              0: conversationCosts.totals.prompt.tokenCount,
            })}
          </div>
          <div>${Math.abs(conversationCosts.totals.prompt.usd).toFixed(6)}</div>
        </div>
        <div>
          <div>
            {localize('com_ui_token_abbreviation', {
              0: conversationCosts.totals.total.tokenCount,
            })}
          </div>
          <div>${Math.abs(conversationCosts.totals.total.usd).toFixed(6)}</div>
        </div>
        <div>
          <div>
            <ArrowIcon direction="down" />
            {localize('com_ui_token_abbreviation', {
              0: conversationCosts.totals.completion.tokenCount,
            })}
          </div>
          <div>${Math.abs(conversationCosts.totals.completion.usd).toFixed(6)}</div>
        </div>
      </div>
    </div>
  );
}
