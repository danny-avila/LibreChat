import { useEffect, useMemo, useState } from 'react';
import { Button, TextareaAutosize } from '@librechat/client';
import { Check, X, Pencil, MessageSquare, TriangleAlert } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useApprovalContext } from './ApprovalContext';
import { useLocalize } from '~/hooks';
import { cn, logger } from '~/utils';

type DecisionType = Agents.ToolApprovalDecisionType;

const DECISION_ICON: Record<DecisionType, React.ComponentType<{ className?: string }>> = {
  approve: Check,
  reject: X,
  edit: Pencil,
  respond: MessageSquare,
};

const DECISION_LABEL: Record<DecisionType, TranslationKeys> = {
  approve: 'com_ui_approve',
  reject: 'com_ui_reject',
  edit: 'com_ui_edit',
  respond: 'com_ui_respond',
};

/** Pretty-print tool args as JSON for the `edit` textarea seed. */
function seedArgs(args: string | Record<string, unknown> | undefined): string {
  if (args == null) {
    return '{}';
  }
  if (typeof args === 'string') {
    try {
      return JSON.stringify(JSON.parse(args), null, 2);
    } catch {
      return args;
    }
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch (e) {
    logger.error('ToolApproval - failed to stringify args', e);
    return '{}';
  }
}

/**
 * Renders approve / reject / edit / respond controls for a paused tool call,
 * scoped to the decisions the server allows. Records its decision in the
 * batch {@link useApprovalContext}; the lead card additionally renders the
 * single submit button covering every paused call in the action.
 */
export default function ToolApproval({
  approval,
  toolCallId,
  args,
}: {
  approval: NonNullable<Agents.ToolCall['approval']>;
  toolCallId: string;
  args: string | Record<string, unknown> | undefined;
}) {
  const localize = useLocalize();
  const { actionId, allowed_decisions: allowedDecisions, description } = approval;
  const {
    registerToolCall,
    unregisterToolCall,
    setDecision,
    isReady,
    submitToolApproval,
    getStatus,
    getLeadToolCallId,
    getRegisteredCount,
  } = useApprovalContext();

  const [active, setActive] = useState<DecisionType | null>(null);
  const [editText, setEditText] = useState(() => seedArgs(args));
  const [responseText, setResponseText] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    registerToolCall(actionId, toolCallId);
    // Drop the registration when this card unmounts (e.g. the tool resolved and the
    // card was replaced) so a stale entry can't keep the batch's `isReady` false.
    return () => unregisterToolCall(actionId, toolCallId);
  }, [registerToolCall, unregisterToolCall, actionId, toolCallId]);

  const status = getStatus(actionId);
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';

  /** Recompute and store this card's decision whenever inputs change. A null
   *  resolution (e.g. invalid edit JSON) clears it so submit stays disabled. */
  useEffect(() => {
    if (locked) {
      return;
    }
    if (active == null) {
      setDecision(actionId, toolCallId, null);
      return;
    }
    if (active === 'approve') {
      setDecision(actionId, toolCallId, { tool_call_id: toolCallId, decision: 'approve' });
      return;
    }
    if (active === 'reject') {
      setDecision(actionId, toolCallId, {
        tool_call_id: toolCallId,
        decision: 'reject',
        reason: reason.trim() || undefined,
      });
      return;
    }
    if (active === 'respond') {
      const trimmed = responseText.trim();
      setDecision(
        actionId,
        toolCallId,
        trimmed.length > 0
          ? { tool_call_id: toolCallId, decision: 'respond', responseText: trimmed }
          : null,
      );
      return;
    }
    if (active === 'edit') {
      try {
        const editedArguments = JSON.parse(editText) as Record<string, unknown>;
        setDecision(actionId, toolCallId, {
          tool_call_id: toolCallId,
          decision: 'edit',
          editedArguments,
        });
      } catch {
        setDecision(actionId, toolCallId, null);
      }
    }
  }, [active, editText, responseText, reason, locked, setDecision, actionId, toolCallId]);

  const editIsValid = useMemo(() => {
    if (active !== 'edit') {
      return true;
    }
    try {
      JSON.parse(editText);
      return true;
    } catch {
      return false;
    }
  }, [active, editText]);

  const isLead = getLeadToolCallId(actionId) === toolCallId;
  const count = getRegisteredCount(actionId);
  const ready = isReady(actionId);

  const submitLabel = useMemo(() => {
    if (status === 'submitting') {
      return localize('com_ui_submitting');
    }
    if (count > 1) {
      return localize('com_ui_submit_decisions', { 0: count });
    }
    return localize('com_ui_submit');
  }, [status, count, localize]);

  if (status === 'submitted') {
    return null;
  }

  return (
    <div className="my-2 flex w-full flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-3">
      {description != null && description.length > 0 && (
        <p className="text-sm text-text-secondary">{description}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {allowedDecisions.map((decision) => {
          const Icon = DECISION_ICON[decision];
          return (
            <Button
              key={decision}
              size="sm"
              variant={active === decision ? 'default' : 'outline'}
              disabled={locked}
              aria-pressed={active === decision}
              onClick={() => setActive((prev) => (prev === decision ? null : decision))}
              className="inline-flex items-center gap-1.5"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {localize(DECISION_LABEL[decision])}
            </Button>
          );
        })}
      </div>

      {active === 'edit' && (
        <div className="flex flex-col gap-1">
          <TextareaAutosize
            value={editText}
            disabled={locked}
            onChange={(e) => setEditText(e.target.value)}
            minRows={3}
            maxRows={16}
            className={cn(
              'w-full resize-none rounded-md border bg-surface-primary p-2 font-mono text-xs',
              editIsValid ? 'border-border-light' : 'border-red-500',
            )}
            aria-label={localize('com_ui_edit')}
          />
          {!editIsValid && (
            <span className="text-xs text-text-warning">{localize('com_ui_invalid_json')}</span>
          )}
        </div>
      )}

      {active === 'respond' && (
        <TextareaAutosize
          value={responseText}
          disabled={locked}
          onChange={(e) => setResponseText(e.target.value)}
          minRows={2}
          maxRows={12}
          placeholder={localize('com_ui_tool_response_placeholder')}
          className="w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
          aria-label={localize('com_ui_respond')}
        />
      )}

      {active === 'reject' && (
        <TextareaAutosize
          value={reason}
          disabled={locked}
          onChange={(e) => setReason(e.target.value)}
          minRows={1}
          maxRows={6}
          placeholder={localize('com_ui_reject_reason_placeholder')}
          className="w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
          aria-label={localize('com_ui_reject')}
        />
      )}

      {isLead && (
        <div className="mt-1 flex items-center gap-3">
          <Button
            size="sm"
            variant="submit"
            disabled={!ready || locked}
            onClick={() => submitToolApproval(actionId)}
          >
            {submitLabel}
          </Button>
          {status === 'expired' && (
            <span className="flex items-center text-xs text-text-warning">
              <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_ui_approval_expired')}
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center text-xs text-text-warning">
              <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_ui_approval_error')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
