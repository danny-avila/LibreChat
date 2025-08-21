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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1em"
              height="1em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="inline"
            >
              <path
                fillRule="evenodd"
                d="M11.293 5.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1-1.414 1.414L13 8.414V18a1 1 0 1 1-2 0V8.414l-3.293 3.293a1 1 0 0 1-1.414-1.414l5-5Z"
                clipRule="evenodd"
              ></path>
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1em"
              height="1em"
              fill="currentColor"
              viewBox="0 0 24 24"
              className="inline"
            >
              <path
                fillRule="evenodd"
                d="M12.707 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 15.586V6a1 1 0 1 1 2 0v9.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5Z"
                clipRule="evenodd"
              ></path>
            </svg>
            {conversationCosts.totals.completion.tokenCount}t
          </div>
          <div>${Math.abs(conversationCosts.totals.completion.usd).toFixed(6)}</div>
        </div>
      </div>
    </div>
  );
}
