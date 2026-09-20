import { Tools, ContentTypes } from 'librechat-data-provider';
import type { Agents, PartMetadata, TMessageContentParts } from 'librechat-data-provider';
import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks';
import { getBatchActivityLabelPart, getActivityLabelText } from '~/utils/activityLabels';
import { hasPendingApprovalInPart, hasPendingAuthInPart } from '~/utils/groupToolCalls';
import { ASK_USER_QUESTION, getSubmittedAskAnswer } from '~/utils/approval';
import { resolveToolCallPhase } from '~/utils/toolCallPhase';
import { getToolDisplayLabel } from '~/utils/toolLabels';
import { isBashProgrammaticToolCall } from './routing';
import { boundIntentLabel, getToolCallIntent } from './Parts/intent';
import { isError } from './ToolOutput';

/** How often a live fold's header may repaint. A streamed intent moves the
 *  newest line on nearly every delta; the header is a glanceable status, not a
 *  transcript, so it takes the latest value at most twice a second. */
export const LIVE_ACTIVITY_THROTTLE_MS = 500;

export type LiveActivity = {
  /** The newest line of the span, or empty before anything nameable exists. */
  text: string;
  /** Identity of whatever produced `text`. A sentence still streaming keeps
   *  its source, so the header can extend it in place and reserve the ticker
   *  transition for a genuinely different line. */
  source: string;
  iconNames: string[];
};

type Localize = (phraseKey: TranslationKeys, options?: TOptions) => string;

type LiveToolCall = Agents.ToolCall & { subagent_content?: TMessageContentParts[] } & Pick<
    PartMetadata,
    'runStepStatus'
  > & { progress?: number };

/**
 * The agents-shaped call — the only variant a live header can name. The
 * legacy Assistants variants (code interpreter, retrieval, function) carry no
 * top-level `args`; a span made only of those is left unfolded.
 */
export const getStandardToolCall = (part: TMessageContentParts): LiveToolCall | undefined => {
  if (part.type !== ContentTypes.TOOL_CALL) {
    return undefined;
  }
  const toolCall = part[ContentTypes.TOOL_CALL];
  return toolCall != null && 'args' in toolCall ? (toolCall as LiveToolCall) : undefined;
};

/**
 * True when the run is waiting on the reader: an unresolved approval, a
 * sign-in, or an open question. A live fold must never hold one of these — the
 * span renders unfolded until it clears.
 */
export function needsReader(part: TMessageContentParts | undefined): boolean {
  if (part == null) {
    return false;
  }
  if (hasPendingApprovalInPart(part) || hasPendingAuthInPart(part)) {
    return true;
  }
  const toolCall = getStandardToolCall(part);
  if (toolCall == null) {
    return false;
  }
  if (toolCall.name === ASK_USER_QUESTION) {
    return (toolCall.output?.length ?? 0) === 0 && getSubmittedAskAnswer(toolCall.id) === undefined;
  }
  /** A subagent's own calls can wait on the reader too, and the collapsed row
   *  unmounts the card that leads to them. */
  return Array.isArray(toolCall.subagent_content) && toolCall.subagent_content.some(needsReader);
}

function toolCallLine(
  toolCall: LiveToolCall,
  localize: Localize,
  serverNames: readonly string[],
): string {
  const intent = getToolCallIntent(toolCall.args);
  const label = getToolDisplayLabel(toolCall.name ?? '', localize, serverNames);
  const output = toolCall.output ?? '';
  const progress = output.length > 0 || toolCall.progress === 1 ? 1 : (toolCall.progress ?? 0.1);
  /** The same resolver the card uses, so a collapsed row never reads as a
   *  success while the card it hides shows a failure or a stop. */
  const phase = resolveToolCallPhase({
    /** A backgrounded task's stop is recorded on the call, not on the dispatch
     *  step, which usually closes as `completed`. */
    runStepStatus:
      toolCall.backgroundTask?.cancelled === true ? 'cancelled' : toolCall.runStepStatus,
    displayProgress: progress,
    reportedProgress: progress,
    isSubmitting: true,
    hasError: isError(output),
  });
  if (phase === 'cancelled') {
    return localize('com_ui_cancelled');
  }
  if (phase === 'failed') {
    const subject = intent ?? label;
    return subject ? `${localize('com_ui_failed')}: ${subject}` : localize('com_ui_failed');
  }
  if (intent != null) {
    return intent;
  }
  if (!label) {
    return localize('com_assistants_running_action');
  }
  return localize(
    phase === 'completed' ? 'com_assistants_completed_function' : 'com_assistants_running_var',
    { 0: label },
  );
}

/** Icons the header stack can show; collecting more is wasted work. */
const MAX_LIVE_ICONS = 4;

function newestLine(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
): Pick<LiveActivity, 'text' | 'source'> {
  for (let position = parts.length - 1; position >= 0; position -= 1) {
    const part = parts[position];
    if (part == null) {
      continue;
    }
    if (part.type === ContentTypes.THINK) {
      /** Reached before any call or label, this thought IS the tail — the
       *  model is reasoning about its next step. Its streaming peek stays
       *  inside the fold, so the header names it: the generated reasoning
       *  label when one exists, the generic word until then. */
      const reasoning = typeof part.think === 'string' ? part.think : (part.think?.value ?? '');
      const label = part.reasoning_label?.trim();
      if (label || reasoning.trim()) {
        return { text: label || localize('com_ui_thinking'), source: `think:${position}` };
      }
      continue;
    }
    if (part.type === ContentTypes.TEXT) {
      /** Only short commentary can sit inside a fold. It is the model talking
       *  about what it is doing, which is exactly what this line is for —
       *  leaving it unnamed would hold a stale call on screen while new prose
       *  piles up behind the disclosure. */
      const value = typeof part.text === 'string' ? part.text : (part.text?.value ?? '');
      const commentary = boundIntentLabel(value);
      if (commentary != null) {
        return { text: commentary, source: `text:${position}` };
      }
      continue;
    }
    const labelText = getActivityLabelText(getBatchActivityLabelPart(part));
    if (labelText) {
      return { text: labelText, source: `label:${position}` };
    }
    const toolCall = getStandardToolCall(part);
    if (toolCall != null) {
      return {
        text: toolCallLine(toolCall, localize, serverNames),
        source: `tool:${toolCall.id ?? position}`,
      };
    }
  }
  return { text: '', source: '' };
}

/**
 * The newest nameable activity in a span: the last tool call's own line (its
 * streamed intent, else the generic text its card would show), a filled batch
 * label once one lands after it, or the thought streaming after both. Later parts win, so the
 * header always reads as the bottom line of the list it stands for.
 *
 * Runs on every streamed delta, so neither scan covers the span: the line
 * stops at the first nameable part from the tail, and the icons stop once the
 * stack is full.
 */
export function getLiveActivity(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
): LiveActivity {
  const icons = new Set<string>();
  for (let position = 0; position < parts.length && icons.size < MAX_LIVE_ICONS; position += 1) {
    const part = parts[position];
    const toolCall = part == null ? undefined : getStandardToolCall(part);
    if (toolCall == null) {
      continue;
    }
    const name = toolCall.name ?? '';
    icons.add(isBashProgrammaticToolCall(name, toolCall.args) ? Tools.bash_tool : name);
  }
  return { ...newestLine(parts, localize, serverNames), iconNames: Array.from(icons) };
}
