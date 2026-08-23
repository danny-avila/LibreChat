import { useCallback } from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@librechat/client';
import { useResetRecoilState, useSetRecoilState } from 'recoil';
import type { ParentSubagentSummary } from 'librechat-data-provider';
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
  parentMessageId,
}: {
  conversationId: string;
  parentMessageId: string;
}) {
  const { byMessageId } = useParentSubagents();
  const children = byMessageId.get(parentMessageId) ?? [];
  if (children.length === 0) return null;
  return (
    <EventSubagentRows
      conversationId={conversationId}
      parentMessageId={parentMessageId}
      eventChildren={children}
    />
  );
}

function EventSubagentRows({
  conversationId,
  parentMessageId,
  eventChildren,
}: {
  conversationId: string;
  parentMessageId: string;
  eventChildren: ParentSubagentSummary[];
}) {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const { refresh } = useParentSubagents();
  const setSelected = useSetRecoilState(activeSubagentPanel);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
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
      className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary"
      data-event-subagent-group={parentMessageId}
    >
      <div className="border-b border-border-light px-3 py-2 text-xs font-medium text-text-secondary">
        {localize('com_ui_subagent_activity')}
      </div>
      <div className="divide-y divide-border-light">
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
              data-subagent-parent-message={parentMessageId}
              data-subagent-part-index="0"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                canOpen ? 'hover:bg-surface-tertiary' : 'cursor-default opacity-70',
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
