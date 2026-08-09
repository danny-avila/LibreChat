import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { ChevronDown, MessageCircleQuestion, Users } from 'lucide-react';
import { Tools, Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type {
  TAttachment,
  TMessageContentParts,
  Agents,
  FunctionToolCall,
} from 'librechat-data-provider';
import type { PartWithIndex } from './ParallelContent';
import { cn, getToolDisplayLabel, getBatchActivityLabelPart, getActivityLabelText } from '~/utils';
import { useLocalize, useExpandCollapse, scheduleMessageContentLayoutReconcile } from '~/hooks';
import { useMCPIconMap, useMCPServerNames } from '~/hooks/MCP';
import { isBashProgrammaticToolCall } from './routing';
import { ASK_USER_QUESTION } from '~/utils/approval';
import { StackedToolIcons } from './ToolOutput';
import { AttachmentGroup } from './Parts';
import store from '~/store';

interface ToolMeta {
  name: string;
  iconName: string;
  hasOutput: boolean;
}

type ToolCallWithNestedContent = Agents.ToolCall & {
  subagent_content?: TMessageContentParts[];
};

function hasPendingApprovalInPart(part: TMessageContentParts): boolean {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return false;
  }
  const toolCall = part[ContentTypes.TOOL_CALL] as ToolCallWithNestedContent | undefined;
  if (!toolCall) {
    return false;
  }
  if (toolCall.approval != null && (toolCall.output?.length ?? 0) === 0) {
    return true;
  }
  return (
    Array.isArray(toolCall.subagent_content) &&
    toolCall.subagent_content.some(hasPendingApprovalInPart)
  );
}

function getToolMeta(part: TMessageContentParts): ToolMeta | null {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return null;
  }
  const toolCall = part[ContentTypes.TOOL_CALL];
  if (!toolCall) {
    return null;
  }

  const isStandard =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);
  if (isStandard) {
    const tc = toolCall as Agents.ToolCall & { progress?: number };
    /** Subagents can finish with `progress === 1` and no final output
     *  text (the parent saw "" / undefined back). Fall back to progress
     *  so the group header flips from "Running N agents" to "Ran N
     *  agents" on completion even when the child returned no text. */
    const completed = !!tc.output || tc.progress === 1;
    const name = tc.name ?? '';
    const iconName = isBashProgrammaticToolCall(name, tc.args) ? Tools.bash_tool : name;
    return { name, iconName, hasOutput: completed };
  }

  if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
    const ci = (toolCall as { code_interpreter?: { outputs?: unknown[] } }).code_interpreter;
    return {
      name: 'code_interpreter',
      iconName: 'code_interpreter',
      hasOutput: (ci?.outputs?.length ?? 0) > 0,
    };
  }

  if (toolCall.type === ToolCallTypes.RETRIEVAL || toolCall.type === ToolCallTypes.FILE_SEARCH) {
    return {
      name: 'file_search',
      iconName: 'file_search',
      hasOutput: !!(toolCall as { output?: string }).output,
    };
  }

  if (toolCall.type === ToolCallTypes.FUNCTION && ToolCallTypes.FUNCTION in toolCall) {
    const fn = (toolCall as FunctionToolCall).function;
    return { name: fn.name, iconName: fn.name, hasOutput: !!fn.output };
  }

  return null;
}

interface ToolCallGroupProps {
  parts: PartWithIndex[];
  isSubmitting: boolean;
  isLast: boolean;
  renderPart: (
    part: TMessageContentParts,
    idx: number,
    isLastPart: boolean,
    onToolExpand?: () => void,
  ) => React.ReactNode;
  lastContentIdx: number;
  groupAttachments?: TAttachment[];
  initialExpansionState?: ToolCallGroupExpansionState;
  onExpansionChange?: (state: ToolCallGroupExpansionState) => void;
  /** Activity-label part terminating this block; when it carries generated
   *  text the header shows that text instead of the default tool summary. */
  labelPart?: PartWithIndex;
}

export type ToolCallGroupExpansionState = {
  isExpanded: boolean;
  userOverride: boolean;
};

export default function ToolCallGroup({
  parts,
  isSubmitting,
  isLast,
  renderPart,
  lastContentIdx,
  groupAttachments,
  initialExpansionState,
  onExpansionChange,
  labelPart,
}: ToolCallGroupProps) {
  const localize = useLocalize();
  const mcpIconMap = useMCPIconMap();
  const mcpServerNames = useMCPServerNames();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cancelLayoutReconcileRef = useRef<(() => void) | null>(null);
  const retainedForPendingApprovalRef = useRef(false);

  /** Labeled activity blocks also contain THINK parts, which yield null
   *  metadata. Narrow to tool entries once: they alone drive the count, the
   *  completion check, and the icon strip — passing a null-derived empty
   *  name to StackedToolIcons would render a phantom generic tool icon. */
  const toolMetadata = useMemo(
    () => parts.map((p) => getToolMeta(p.part)).filter((m): m is ToolMeta => m != null),
    [parts],
  );
  const count = toolMetadata.length;
  /** Approval state is read from the RAW parts, not `toolMetadata`: a pending
   *  call can be nested inside a subagent's content, which never surfaces as
   *  a tool entry here. */
  const hasPendingApproval = useMemo(
    () => parts.some(({ part }) => hasPendingApprovalInPart(part)),
    [parts],
  );
  const activityLabel = getBatchActivityLabelPart(labelPart?.part);
  const activityLabelText = getActivityLabelText(activityLabel);
  const activityFailed = activityLabel?.status === 'failed' || activityLabel?.status === 'partial';
  /** A settled, filled label is itself a completion proof: the PostToolBatch
   *  claim only happens after every output in the batch returned. Without
   *  it, a tool that legitimately returns an empty string reads as
   *  `hasOutput: false` forever and its labeled group never auto-collapses. */
  const labelSettled =
    activityLabelText.length > 0 &&
    (labelPart?.part as { pending?: boolean } | undefined)?.pending !== true;
  const allCompleted = useMemo(
    () => labelSettled || toolMetadata.every((m) => m.hasOutput === true),
    [toolMetadata, labelSettled],
  );
  const toolNames = useMemo(() => toolMetadata.map((m) => m.name), [toolMetadata]);
  const iconToolNames = useMemo(() => toolMetadata.map((m) => m.iconName), [toolMetadata]);

  /** Subagent tool calls get their own label verb ("Running/Ran N agents")
   *  since "Used N tools" reads oddly when the "tools" are actually child
   *  agents. `subagentCount === count` ⇒ the group is 100% subagents. */
  const subagentCount = useMemo(
    () => toolNames.filter((n) => n === Constants.SUBAGENT).length,
    [toolNames],
  );
  const allSubagents = subagentCount > 0 && subagentCount === count;
  /** Past-tense label once the parent stream is no longer live OR every
   *  child has a terminal signal (output / progress === 1). Without the
   *  `!isSubmitting` branch, a cancelled or errored subagent that never
   *  reached `progress === 1` would leave the header stuck on "Running
   *  N agents" forever — each individual card already renders its own
   *  terminal state ("Cancelled agent", "Agent errored"), so the group
   *  summary needs to match that tense. */
  const subagentsDone = allSubagents && (allCompleted || !isSubmitting);

  /** `ask_user_question` calls form their own category, mirroring subagents:
   *  a homogeneous group reads "Asking/Asked N questions" (never "Used N
   *  tools — ask_user_question") with a question glyph. A group only exists
   *  at count >= 2, so the plural is always grammatical. */
  const askQuestionCount = useMemo(
    () => toolNames.filter((n) => n === ASK_USER_QUESTION).length,
    [toolNames],
  );
  const allAskQuestions = askQuestionCount > 0 && askQuestionCount === count;
  /** Past tense once the turn is settled — matches the Asking/Asked record
   *  card. While a multi-question turn streams, the still-open question's
   *  tool_call part has no output yet, so keep the present tense. */
  const askQuestionsDone = allAskQuestions && (allCompleted || !isSubmitting);

  const toolNameSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const rawName of toolNames) {
      if (!rawName) continue;
      const label = getToolDisplayLabel(rawName, localize, mcpServerNames);
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    if (labels.length <= 3) {
      return labels.join(', ');
    }
    return `${labels.slice(0, 3).join(', ')}, +${labels.length - 3}`;
  }, [toolNames, localize, mcpServerNames]);

  const autoExpand = useRecoilValue(store.autoExpandTools);
  /** A labeled activity block is summarized by its header, so it collapses
   *  even at a single tool call — agent runs are full of one-call batches,
   *  and leaving those expanded defeats the grouping. */
  const autoCollapse = !autoExpand && allCompleted && (count >= 2 || activityLabelText.length > 0);
  const initialState = initialExpansionState?.userOverride === true ? initialExpansionState : null;
  const [isExpanded, setIsExpanded] = useState(
    initialState?.isExpanded ?? (autoExpand || !autoCollapse),
  );
  const [userOverride, setUserOverride] = useState(initialState != null);
  const [shouldRenderBody, setShouldRenderBody] = useState(isExpanded);
  const previousIsExpandedRef = useRef(isExpanded);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(isExpanded);
  const notifyLayoutChange = useCallback(() => {
    cancelLayoutReconcileRef.current?.();
    cancelLayoutReconcileRef.current = scheduleMessageContentLayoutReconcile(rootRef.current);
  }, []);

  useEffect(
    () => () => {
      cancelLayoutReconcileRef.current?.();
    },
    [],
  );

  useEffect(() => {
    const wasExpanded = previousIsExpandedRef.current;
    previousIsExpandedRef.current = isExpanded;
    if (wasExpanded && !isExpanded) {
      notifyLayoutChange();
    }
  }, [isExpanded, notifyLayoutChange]);

  useEffect(() => {
    if (autoCollapse && !userOverride) {
      setIsExpanded(false);
    }
  }, [autoCollapse, userOverride]);

  const handleToggle = useCallback(() => {
    const nextExpanded = !isExpanded;
    setUserOverride(true);
    if (nextExpanded) {
      setShouldRenderBody(true);
    }
    setIsExpanded(nextExpanded);
    onExpansionChange?.({ isExpanded: nextExpanded, userOverride: true });
  }, [isExpanded, onExpansionChange]);

  const handleToolExpand = useCallback(() => {
    setUserOverride(true);
    setShouldRenderBody(true);
    setIsExpanded(true);
    onExpansionChange?.({ isExpanded: true, userOverride: true });
  }, [onExpansionChange]);

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (isExpanded) {
        return;
      }
      if (hasPendingApproval) {
        // Approval controls own unsent local form state. Keep unresolved cards
        // mounted (the collapsed panel is inert/hidden) so collapsing a batch
        // cannot erase decisions the reviewer already made.
        retainedForPendingApprovalRef.current = true;
        return;
      }
      retainedForPendingApprovalRef.current = false;
      setShouldRenderBody(false);
      notifyLayoutChange();
    },
    [hasPendingApproval, isExpanded, notifyLayoutChange],
  );

  useEffect(() => {
    if (isExpanded) {
      retainedForPendingApprovalRef.current = false;
      return;
    }
    if (!hasPendingApproval && retainedForPendingApprovalRef.current) {
      // A completed collapse transition retained this body only to preserve
      // approval form state. Release it once the last approval resolves.
      retainedForPendingApprovalRef.current = false;
      setShouldRenderBody(false);
      notifyLayoutChange();
    }
  }, [hasPendingApproval, isExpanded, notifyLayoutChange]);

  /** Category-aware header verb: subagents and questions read as their own
   *  category (with tense), everything else is the generic "Used N tools". */
  const resolveGroupLabel = (): string => {
    if (allSubagents) {
      return subagentsDone
        ? localize('com_ui_ran_n_agents', { 0: String(count) })
        : localize('com_ui_running_n_agents', { 0: String(count) });
    }
    if (allAskQuestions) {
      return askQuestionsDone
        ? localize('com_ui_asked_n_questions', { 0: String(count) })
        : localize('com_ui_asking_n_questions', { 0: String(count) });
    }
    return localize('com_ui_used_n_tools', { 0: String(count) });
  };
  /** The generated line wins over the generic category verb — but only once
   *  it exists. An unfilled label part leaves the block rendering exactly as
   *  it would without the feature. */
  const groupLabel = activityLabelText.length > 0 ? activityLabelText : resolveGroupLabel();
  /** Single category glyph for homogeneous groups (else StackedToolIcons). */
  const CategoryIcon = allSubagents ? Users : MessageCircleQuestion;

  const hasActiveToolCall = useMemo(
    () => isSubmitting && toolMetadata.some((m) => m && !m.hasOutput),
    [toolMetadata, isSubmitting],
  );

  useEffect(() => {
    if (hasActiveToolCall && !userOverride) {
      setShouldRenderBody(true);
      setIsExpanded(true);
    }
  }, [hasActiveToolCall, userOverride]);

  return (
    <div className="mb-2 mt-1" ref={rootRef}>
      <Button
        variant="ghost"
        type="button"
        className="inline-flex h-auto w-full items-center justify-start gap-2 rounded-none bg-transparent p-0 py-1 text-text-secondary hover:bg-transparent hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy focus-visible:ring-offset-0"
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={groupLabel}
      >
        {allSubagents || allAskQuestions ? (
          /** Homogeneous category groups get a single category glyph instead
           *  of StackedToolIcons' generic wrenches: a Users glyph for
           *  subagents, a question glyph for ask_user_question — matching
           *  their individual card headers and reading as the category
           *  rather than "tools". */
          <div
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary',
              !allCompleted && isSubmitting && 'animate-pulse text-text-primary',
            )}
            aria-hidden="true"
          >
            <CategoryIcon size={14} />
          </div>
        ) : (
          <StackedToolIcons
            toolNames={iconToolNames}
            mcpIconMap={mcpIconMap}
            maxIcons={4}
            isAnimating={!allCompleted && isSubmitting}
          />
        )}
        <span
          className={cn(
            'tool-status-text min-w-0 truncate font-medium',
            activityFailed && 'text-amber-600 dark:text-amber-400',
          )}
          role="status"
          title={groupLabel}
        >
          {groupLabel}
        </span>
        {/** Hide the tool-name summary for pure-category groups (subagents /
         *   questions) — every entry deduplicates to the same token, which
         *   adds noise without info. Mixed groups keep the summary. */}
        {toolNameSummary && !allSubagents && !allAskQuestions && (
          <span className="min-w-0 max-w-[40%] truncate text-xs font-normal text-text-secondary">
            · {toolNameSummary}
          </span>
        )}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-text-secondary transition-transform duration-200 ease-out',
            isExpanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </Button>
      <div
        style={expandStyle}
        onTransitionEnd={handleTransitionEnd}
        aria-hidden={!isExpanded}
        data-testid="tool-call-group-panel"
      >
        {shouldRenderBody && (
          <div className="overflow-hidden" ref={expandRef}>
            <div className="py-0.5 pl-4">
              {parts.map(({ part, idx }) =>
                renderPart(part, idx, isLast && idx === lastContentIdx, handleToolExpand),
              )}
            </div>
          </div>
        )}
      </div>
      {groupAttachments && groupAttachments.length > 0 && (
        <AttachmentGroup attachments={groupAttachments} />
      )}
    </div>
  );
}
