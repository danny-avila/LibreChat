import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { Bot, CornerDownRight, Radio } from 'lucide-react';
import { ContentTypes, EModelEndpoint } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { ChildConversationTurn } from './adapters';
import type { TranslationKeys } from '~/hooks';
import {
  hasTruncatedActivityDetails,
  SubagentActivityContent,
  SubagentStatus,
} from './SubagentActivity';
import ContentParts from '~/components/Chat/Messages/Content/ContentParts';
import MessageRow from '~/components/Chat/Messages/ui/MessageRow';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
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
}: {
  turn: ChildConversationTurn;
  state: 'ready' | 'loading' | 'error';
  agentId?: string;
  conversationId?: string | null;
  fullWidth: boolean;
  onCancelControl?: (controlId: string) => void;
}) {
  const agentsMap = useAgentsMapContext();
  const agent = agentId == null ? undefined : agentsMap?.[agentId];
  const label = agent?.name ?? turn.activity.title;
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
      footer={
        turn.activity.status === 'completed' ? null : <SubagentStatus activity={turn.activity} />
      }
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
        showDetailTruncationNotice={false}
        conversationId={conversationId}
        onCancelControl={onCancelControl}
      />
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
}: {
  turns: ChildConversationTurn[];
  agentId?: string;
  conversationId?: string | null;
  stateByTask?: ReadonlyMap<string, 'ready' | 'loading' | 'error'>;
  controllableTaskId?: string;
  onCancelControl?: (taskId: string, controlId: string) => void;
}) {
  const localize = useLocalize();
  const fullWidth = useRecoilValue(store.maximizeChatSpace);
  const hasShortenedDetails = turns.some((turn) => hasTruncatedActivityDetails(turn.activity));
  return (
    <div className="flex flex-col gap-6 py-4" data-subagent-conversation>
      {hasShortenedDetails && (
        <div className="px-4 text-xs italic text-text-secondary">
          {localize('com_ui_subagent_activity_details_truncated')}
        </div>
      )}
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
            />
          </div>
        </section>
      ))}
    </div>
  );
}
