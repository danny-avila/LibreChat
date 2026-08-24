import { memo, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TConversation } from 'librechat-data-provider';
import { useLocalize, useLocalStorage } from '~/hooks';
import { useActiveJobs } from '~/data-provider';
import { Collapse } from '~/components/ui';
import { cn } from '~/utils';
import Convo from './Convo';

const noop = () => {};

interface PinnedSectionProps {
  conversations: TConversation[];
  toggleNav: () => void;
}

const PinnedSection = ({ conversations, toggleNav }: PinnedSectionProps) => {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useLocalStorage('pinnedSectionExpanded', true);
  const { data: activeJobsData } = useActiveJobs();
  const activeJobIds = useMemo(
    () => new Set(activeJobsData?.activeJobIds ?? []),
    [activeJobsData?.activeJobIds],
  );

  if (conversations.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col px-3 text-sm"
      role="region"
      aria-label={localize('com_ui_pinned')}
    >
      <div className="flex h-8 w-full items-center pr-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="select-none truncate">{localize('com_ui_pinned')}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded ? '' : '-rotate-90',
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      <Collapse open={isExpanded}>
        <div className="scrollbar-gutter-stable max-h-[30vh] overflow-y-auto">
          <ul className="m-0 list-none p-0">
            {conversations.map((convo) => (
              <li key={convo.conversationId} className="list-none">
                <Convo
                  conversation={convo}
                  retainView={noop}
                  toggleNav={toggleNav}
                  isGenerating={activeJobIds.has(convo.conversationId ?? '')}
                />
              </li>
            ))}
          </ul>
        </div>
      </Collapse>
    </div>
  );
};

PinnedSection.displayName = 'PinnedSection';

export default memo(PinnedSection);
