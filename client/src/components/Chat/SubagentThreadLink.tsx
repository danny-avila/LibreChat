import { useMemo } from 'react';
import { Button } from '@librechat/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGetConversationByIdQuery } from 'librechat-data-provider/react-query';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { cn } from '~/utils';

const CHILD_THREAD_POLL_WINDOW_MS = 60_000;

export default function SubagentThreadLink({
  threadId,
  relation,
  className,
  labelClassName,
}: {
  threadId: string;
  relation: 'parent' | 'child';
  className?: string;
  labelClassName?: string;
}) {
  const localize = useLocalize();
  const { navigateToConvo } = useNavigateToConvo();
  const normalizedThreadId = threadId.trim();
  const isParent = relation === 'parent';
  const childPoll = useMemo(
    () => ({ threadId: normalizedThreadId, deadline: Date.now() + CHILD_THREAD_POLL_WINDOW_MS }),
    [normalizedThreadId],
  );
  const { data: targetConversation } = useGetConversationByIdQuery(normalizedThreadId, {
    enabled: normalizedThreadId !== '',
    retry: false,
    refetchInterval: (conversation) =>
      !isParent &&
      conversation == null &&
      normalizedThreadId === childPoll.threadId &&
      Date.now() < childPoll.deadline
        ? 1500
        : false,
  });
  if (normalizedThreadId === '' || targetConversation == null) {
    return null;
  }

  const label = localize(
    isParent ? 'com_ui_subagent_back_to_parent' : 'com_ui_subagent_open_thread',
  );
  const Icon = isParent ? ChevronLeft : ChevronRight;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('shrink-0 gap-1', className)}
      aria-label={label}
      title={label}
      onClick={() => navigateToConvo(targetConversation)}
    >
      {isParent && <Icon size={16} aria-hidden="true" />}
      <span className={labelClassName}>{label}</span>
      {!isParent && <Icon size={16} aria-hidden="true" />}
    </Button>
  );
}
