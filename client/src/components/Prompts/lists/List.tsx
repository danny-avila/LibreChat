import { FileText } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import ChatGroupItem from './ChatGroupItem';
import { useLocalize } from '~/hooks';

export default function List({
  groups = [],
  isLoading,
  isChatRoute,
}: {
  groups?: TPromptGroup[];
  isLoading: boolean;
  isChatRoute?: boolean;
}) {
  const localize = useLocalize();

  return (
    <section className="flex-grow" aria-label={localize('com_ui_prompt_groups')}>
      <div>
        {isLoading &&
          Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="mb-1.5 h-[72px] w-full rounded-xl" />
          ))}
        {!isLoading && groups.length === 0 && (
          <div className="my-2 flex flex-col items-center justify-center rounded-lg border border-border-medium bg-transparent p-6 text-center">
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
              <FileText className="size-5 text-text-secondary" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-text-primary">
              {localize('com_ui_no_prompts_title')}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {localize('com_ui_add_first_prompt')}
            </p>
          </div>
        )}
        {groups.map((group) => (
          <ChatGroupItem key={group._id} group={group} isChatRoute={isChatRoute} />
        ))}
      </div>
    </section>
  );
}
