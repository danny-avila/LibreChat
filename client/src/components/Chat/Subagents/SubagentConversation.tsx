import { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import { Bot, ChevronDown, CornerDownRight, Radio } from 'lucide-react';
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@librechat/client';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { ChildConversationTurn } from './adapters';
import type { TranslationKeys } from '~/hooks';
import { SubagentActivityContent, SubagentStatus } from './SubagentActivity';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import MessageRow from '~/components/Chat/Messages/ui/MessageRow';
import { ElapsedTimer } from '~/components/Chat/Messages/Elapsed';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import { isAbnormalTerminalStatus } from './status';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

const TRIGGER_LABELS = {
  parent_dispatch: 'com_ui_subagent_trigger_parent_dispatch',
  parent_continuation: 'com_ui_subagent_trigger_parent_continuation',
  external_event: 'com_ui_subagent_trigger_external_event',
} as const satisfies Record<ChildConversationTurn['trigger']['kind'], TranslationKeys>;

function TriggerIcon({ kind }: { kind: ChildConversationTurn['trigger']['kind'] }) {
  const Icon = kind === 'external_event' ? Radio : CornerDownRight;
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-surface-tertiary text-text-secondary">
      <Icon size={14} aria-hidden />
    </span>
  );
}

function ExternalEventTrigger({
  turn,
  fullWidth,
}: {
  turn: ChildConversationTurn;
  fullWidth: boolean;
}) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const details = turn.trigger.externalEvent;
  const label = localize('com_ui_subagent_trigger_external_event');
  let body: ReactNode;
  if (details == null) {
    body = (
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <TriggerIcon kind="external_event" />
        <span>{label}</span>
      </div>
    );
  } else {
    body = (
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-6 w-full justify-start gap-1.5 px-0 text-left text-xs font-medium text-text-secondary hover:bg-transparent hover:text-text-primary"
          >
            <TriggerIcon kind="external_event" />
            <span>{label}</span>
            <span className="min-w-0 truncate font-normal">
              {details.eventType} · {details.sourceType}
            </span>
            <span className="sr-only">{details.occurredAt}</span>
            <ChevronDown
              size={14}
              aria-hidden
              className={`ml-auto shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-8 border-l border-border-light py-1 pl-3 text-xs text-text-secondary">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>{localize('com_ui_subagent_event_type')}</dt>
            <dd className="break-words text-text-primary">{details.eventType}</dd>
            <dt>{localize('com_ui_subagent_event_source')}</dt>
            <dd className="break-words text-text-primary">{details.sourceType}</dd>
            <dt>{localize('com_ui_subagent_event_received')}</dt>
            <dd className="break-words text-text-primary">
              {new Date(details.occurredAt).toLocaleString()}
            </dd>
            {details.expectedActionToolName != null && (
              <>
                <dt>{localize('com_ui_subagent_event_expected_action')}</dt>
                <dd className="break-words text-text-primary">{details.expectedActionToolName}</dd>
              </>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <MessageRow
      id={`${turn.taskId}:trigger`}
      icon={<TriggerIcon kind="external_event" />}
      label={label}
      footer={null}
      timestamp={turn.trigger.createdAt ?? details?.occurredAt}
      ariaLabel={label}
      headerPrefix=""
      isCreatedByUser={true}
      fullWidth={fullWidth}
    >
      {body}
    </MessageRow>
  );
}

function TriggerMessage({ turn, fullWidth }: { turn: ChildConversationTurn; fullWidth: boolean }) {
  const localize = useLocalize();
  const label = localize(TRIGGER_LABELS[turn.trigger.kind]);
  const content = useMemo<TMessageContentParts[]>(
    () =>
      turn.trigger.summary === ''
        ? []
        : [
            {
              type: ContentTypes.TEXT,
              text: turn.trigger.summary,
            } as TMessageContentParts,
          ],
    [turn.trigger.summary],
  );
  if (turn.trigger.kind === 'external_event') {
    return <ExternalEventTrigger turn={turn} fullWidth={fullWidth} />;
  }
  return (
    <MessageRow
      id={`${turn.taskId}:trigger`}
      icon={<TriggerIcon kind={turn.trigger.kind} />}
      label={label}
      footer={null}
      timestamp={turn.trigger.createdAt}
      ariaLabel={label}
      headerPrefix=""
      isCreatedByUser={true}
      fullWidth={fullWidth}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <TriggerIcon kind={turn.trigger.kind} />
        <span>{label}</span>
      </div>
      {content.length > 0 && (
        <ContentParts
          content={content}
          messageId={`${turn.taskId}:trigger`}
          conversationId={null}
          isCreatedByUser={true}
          isLast={false}
          isSubmitting={false}
          isLatestMessage={false}
        />
      )}
      {turn.trigger.summaryTruncated === true && (
        <div className="mt-1 text-xs italic text-text-secondary">
          {localize('com_ui_subagent_trigger_truncated')}
        </div>
      )}
    </MessageRow>
  );
}

function ChildMessage({
  turn,
  state,
  agentId,
  conversationId,
  fullWidth,
  onCancelControl,
  detailState,
  onLoadDetails,
}: {
  turn: ChildConversationTurn;
  state: 'ready' | 'loading' | 'error';
  agentId?: string;
  conversationId?: string | null;
  fullWidth: boolean;
  onCancelControl?: (controlId: string) => void;
  detailState?: 'idle' | 'loading' | 'unavailable' | 'error';
  onLoadDetails?: () => void;
}) {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const agent = agentId == null ? undefined : agentsMap?.[agentId];
  const label = agent?.name ?? turn.activity.title;
  const detailsLimited = turn.activity.activityTruncated === true;
  let limitedNotice: ReactNode;
  if (detailsLimited && onLoadDetails != null && detailState !== 'unavailable') {
    limitedNotice = (
      <Button type="button" variant="ghost" size="sm" onClick={onLoadDetails}>
        {detailState === 'error'
          ? localize('com_ui_retry')
          : localize('com_ui_subagent_show_full_activity')}
      </Button>
    );
  } else {
    limitedNotice = localize('com_ui_subagent_activity_details_unavailable');
  }
  let footer: ReactNode = null;
  if (isAbnormalTerminalStatus(turn.activity.status)) {
    footer = <SubagentStatus activity={turn.activity} />;
  } else if (turn.activity.status === 'running' || turn.activity.status === 'dispatched') {
    const startedAt = turn.trigger.createdAt == null ? NaN : Date.parse(turn.trigger.createdAt);
    footer = <ElapsedTimer start={Number.isFinite(startedAt) ? startedAt : undefined} />;
  }
  const iconData = {
    endpoint: EModelEndpoint.agents,
    modelLabel: label,
    isCreatedByUser: false,
  };
  return (
    <MessageRow
      id={`${turn.taskId}:assistant`}
      icon={
        agent == null ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-surface-tertiary text-text-secondary">
            <Bot size={14} aria-hidden />
          </span>
        ) : (
          <MessageIcon iconData={iconData} agent={agent} />
        )
      }
      label={label}
      footer={footer}
      ariaLabel={label}
      headerPrefix=""
      isCreatedByUser={false}
      fullWidth={fullWidth}
    >
      <SubagentActivityContent
        activity={turn.activity}
        activityId={`${turn.taskId}:assistant`}
        state={state}
        showPrompt={false}
        conversationId={conversationId}
        onCancelControl={onCancelControl}
      />
      {detailsLimited && detailState !== 'loading' && (
        <div className="mt-2 text-xs text-text-secondary">{limitedNotice}</div>
      )}
      {detailState === 'loading' && (
        <div className="mt-2 text-xs text-text-secondary" aria-live="polite">
          {localize('com_ui_loading')}
        </div>
      )}
    </MessageRow>
  );
}

export default function SubagentConversation({
  turns,
  agentId,
  conversationId,
  stateByTask,
  controllableTaskId,
  onCancelControl,
  detailStateByTask,
  onLoadTurnDetails,
}: {
  turns: ChildConversationTurn[];
  agentId?: string;
  conversationId?: string | null;
  stateByTask?: ReadonlyMap<string, 'ready' | 'loading' | 'error'>;
  controllableTaskId?: string;
  onCancelControl?: (taskId: string, controlId: string) => void;
  detailStateByTask?: ReadonlyMap<string, 'idle' | 'loading' | 'unavailable' | 'error'>;
  onLoadTurnDetails?: (taskId: string) => void;
}) {
  const fullWidth = useRecoilValue(store.maximizeChatSpace);
  return (
    <div className="flex flex-col gap-6 py-4" data-subagent-conversation>
      {turns.map((turn) => (
        <section
          key={turn.taskId}
          className="flex flex-col gap-4"
          data-subagent-thread-turn={turn.taskId}
        >
          <div className="px-4">
            <TriggerMessage turn={turn} fullWidth={fullWidth} />
          </div>
          <div className="px-4">
            <ChildMessage
              turn={turn}
              agentId={agentId}
              conversationId={conversationId}
              fullWidth={fullWidth}
              state={stateByTask?.get(turn.taskId) ?? 'ready'}
              onCancelControl={
                onCancelControl == null || turn.taskId !== controllableTaskId
                  ? undefined
                  : (controlId) => onCancelControl(turn.taskId, controlId)
              }
              detailState={detailStateByTask?.get(turn.taskId)}
              onLoadDetails={
                turn.activity.activityTruncated !== true || onLoadTurnDetails == null
                  ? undefined
                  : () => onLoadTurnDetails(turn.taskId)
              }
            />
          </div>
        </section>
      ))}
    </div>
  );
}
