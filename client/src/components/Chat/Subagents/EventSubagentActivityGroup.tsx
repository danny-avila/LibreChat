import { useCallback, useId, useMemo, useState } from 'react';
import { Button, cn } from '@librechat/client';
import { Bot, ChevronDown } from 'lucide-react';
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil';
import type { ParentSubagentSummary } from 'librechat-data-provider';
import { getMessageRowWidthClass } from '~/components/Chat/Messages/ui/MessageRow';
import { subagentStatusIcon, subagentStatusLabelKey } from './status';
import { useParentSubagents } from './ParentSubagentsProvider';
import { eventSubagentSelection } from './eventSelection';
import { activeSubagentPanel } from '~/store/subagents';
import { useAgentsMapContext } from '~/Providers';
import { renderAgentAvatar } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function EventSubagentActivityGroup({
  conversationId,
  parentMessageIds,
}: {
  conversationId: string;
  parentMessageIds: string[];
}) {
  const { byMessageId } = useParentSubagents();
  const children = useMemo(() => {
    const seen = new Set<string>();
    return parentMessageIds
      .flatMap((messageId) => byMessageId.get(messageId) ?? [])
      .filter((child) => {
        if (seen.has(child.threadId)) return false;
        seen.add(child.threadId);
        return true;
      });
  }, [byMessageId, parentMessageIds]);
  const fullWidth = useRecoilValue(store.maximizeChatSpace);
  if (children.length === 0) return null;
  return (
    <div
      className={cn(
        'mx-auto min-w-0 flex-1 transition-[max-width] duration-theme-normal motion-reduce:transition-none',
        getMessageRowWidthClass({ fullWidth }),
      )}
    >
      <EventSubagentRows conversationId={conversationId} eventChildren={children} />
    </div>
  );
}

function EventSubagentRows({
  conversationId,
  eventChildren,
}: {
  conversationId: string;
  eventChildren: ParentSubagentSummary[];
}) {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const { refresh } = useParentSubagents();
  const setSelected = useSetRecoilState(activeSubagentPanel);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const counts = useMemo(() => {
    const result = new Map<ParentSubagentSummary['status'], number>();
    eventChildren.forEach((child) => result.set(child.status, (result.get(child.status) ?? 0) + 1));
    return result;
  }, [eventChildren]);
  const summary = [
    localize(
      eventChildren.length === 1 ? 'com_ui_subagent_agent_count' : 'com_ui_subagent_agents_count',
      { 0: String(eventChildren.length) },
    ),
    ...Array.from(counts.entries()).map(
      ([status, count]) =>
        `${count} ${localize(subagentStatusLabelKey(status)).toLocaleLowerCase()}`,
    ),
  ].join(' · ');
  const openChild = useCallback(
    (child: ParentSubagentSummary) => {
      const selection = eventSubagentSelection(conversationId, child);
      if (selection == null) return;
      resetCurrentArtifactId();
      setArtifactsVisible(false);
      setSelected(selection);
      void refresh().then((index) => {
        const fresh = index?.children.find((candidate) => candidate.threadId === child.threadId);
        if (fresh == null || fresh.latestTaskId === child.latestTaskId) return;
        const freshSelection = eventSubagentSelection(conversationId, fresh);
        if (freshSelection != null) {
          setSelected((current) => {
            if (
              current?.durable?.threadId !== selection.durable?.threadId ||
              current?.durable?.taskId !== selection.durable?.taskId
            ) {
              return current;
            }
            return freshSelection;
          });
        }
      });
    },
    [conversationId, refresh, resetCurrentArtifactId, setArtifactsVisible, setSelected],
  );
  return (
    <section
      aria-label={localize('com_ui_subagent_activity')}
      className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary/40"
      data-event-subagent-group={eventChildren[0]?.parentMessageId}
    >
      <Button
        variant="ghost"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${localize('com_ui_subagent_activity')}: ${summary}`}
        className="flex h-auto min-h-10 w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary focus-visible:ring-offset-0"
      >
        <Bot size={15} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{summary}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>
      <div
        id={panelId}
        hidden={!expanded}
        className="divide-y divide-border-light border-t border-border-light"
      >
        {eventChildren.map((child) => {
          const StatusIcon = subagentStatusIcon(child.status);
          const agent = child.agentId == null ? undefined : agentsMap?.[child.agentId];
          const label = agent?.name || child.actorId || child.title;
          const canOpen = child.latestTaskId != null;
          return (
            <button
              key={child.threadId}
              type="button"
              disabled={!canOpen}
              onClick={() => openChild(child)}
              data-subagent-tool-call={`event-thread:${child.threadId}`}
              data-subagent-parent-message={child.parentMessageId}
              data-subagent-part-index="0"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary',
                canOpen ? 'hover:bg-surface-hover' : 'cursor-default opacity-70',
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                {agent ? (
                  renderAgentAvatar(agent, { size: 'icon', showBorder: false })
                ) : (
                  <Bot size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{label}</span>
                {child.actorId && child.actorId !== label ? (
                  <span className="block truncate text-xs text-text-secondary">
                    {child.actorId}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <StatusIcon
                  size={14}
                  className={child.status === 'running' ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {localize(subagentStatusLabelKey(child.status))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
