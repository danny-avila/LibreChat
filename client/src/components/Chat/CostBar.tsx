import { ArrowIcon } from '@librechat/client';
import type { TConversationCosts } from 'librechat-data-provider';
import { cn } from '~/utils';

interface CostBarProps {
  conversationCosts: TConversationCosts;
  showCostBar: boolean;
}

export default function CostBar({ conversationCosts, showCostBar }: CostBarProps) {
  if (!conversationCosts || !conversationCosts.totals) {
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
            {conversationCosts.totals.prompt.tokenCount}t
          </div>
          <div>${Math.abs(conversationCosts.totals.prompt.usd).toFixed(6)}</div>
        </div>
        <div>
          <div>{conversationCosts.totals.total.tokenCount}t</div>
          <div>${Math.abs(conversationCosts.totals.total.usd).toFixed(6)}</div>
        </div>
        <div>
          <div>
            <ArrowIcon direction="down" />
            {conversationCosts.totals.completion.tokenCount}t
          </div>
          <div>${Math.abs(conversationCosts.totals.completion.usd).toFixed(6)}</div>
        </div>
      </div>
    </div>
  );
}
