import { Tools, Constants, ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TAttachment,
  PartMetadata,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { TOptions } from 'i18next';
import type { SpanOutcome, SpanSummary } from './outcome';
import type { TranslationKeys } from '~/hooks';
import { getBatchActivityLabelPart, getActivityLabelText } from '~/utils/activityLabels';
import { hasPendingApprovalInPart, hasPendingAuthInPart } from '~/utils/groupToolCalls';
import { ASK_USER_QUESTION, getSubmittedAskAnswer } from '~/utils/approval';
import { boundIntentLabel, getToolCallIntent } from './Parts/intent';
import { getToolDisplayLabel } from '~/utils/toolLabels';
import { isBashProgrammaticToolCall } from './routing';
import { getToolMeta, summarizeSpan } from './outcome';

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
  /** Set while the newest line is a call still running with no intent of its
   *  own. Code cards name their startup from sandbox events that live outside
   *  the content array; the header reads the same signal for this call rather
   *  than unfolding the span to let the card say it. */
  pendingToolCallId?: string;
  /** Consecutive uses of the newest tool, including the current call. */
  comboCount: number;
  /** Failed and stopped calls anywhere in the span, not just the newest line. */
  outcome: SpanOutcome;
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
  part: TMessageContentParts,
  toolCall: LiveToolCall,
  localize: Localize,
  serverNames: readonly string[],
  span: SpanSummary,
): string {
  const intent = getToolCallIntent(toolCall.args);
  const label = getToolDisplayLabel(toolCall.name ?? '', localize, serverNames);
  /** The verdict comes from the resolver the group header uses, so a collapsed
   *  row can never read as a success while the card it hides shows a failure
   *  or a stop — whichever channel reported it. */
  const meta = span.metaOf(part);
  if (meta?.cancelled === true) {
    return localize('com_ui_cancelled');
  }
  if (meta?.failed === true) {
    /** Reads as the hidden card does: `ToolCall` uses the same template. */
    const subject = intent ?? label;
    return subject ? localize('com_ui_failed_subject', { 0: subject }) : localize('com_ui_failed');
  }
  /** Ahead of the intent, as on `BashCall`/`ExecuteCode`: a returned handle
   *  is not a result, and "Ran …" would turn ongoing work into a success. */
  if (meta?.background != null) {
    return localize(
      meta.background === 'running' ? 'com_ui_background_running' : 'com_ui_background_finished',
    );
  }
  if (intent != null) {
    return intent;
  }
  if (!label) {
    return localize('com_assistants_running_action');
  }
  return localize(
    meta?.hasOutput === true ? 'com_assistants_completed_function' : 'com_assistants_running_var',
    { 0: label },
  );
}

/** Bounds the sentence scan on long reasoning, like the streaming peek. */
const REASONING_TAIL_CHARS = 1200;

/**
 * A bounded preview of the sentence the thought is currently writing.
 * Preview offsets are not activity identities: a sliding window, whitespace
 * or a resumed snapshot can move them without starting a new thought.
 */
function lastReasoningSentence(reasoning: string): string | undefined {
  const tail = reasoning
    .slice(-REASONING_TAIL_CHARS)
    .replace(/^\s*<think>\s*/, '')
    .replace(/\s*<\/think>\s*$/, '')
    .trimEnd();
  if (!tail) {
    return undefined;
  }
  let start = 0;
  /** CJK sentences end in full-width marks with no space after them. */
  const boundary = /[.!?]\s+|[。！？]\s*/g;
  for (let match = boundary.exec(tail); match != null; match = boundary.exec(tail)) {
    const end = match.index + match[0].length;
    /** A mark that closes the tail ends the CURRENT sentence; it does not
     *  start an empty one. The finished sentence stays until the next begins. */
    if (end < tail.length) {
      start = end;
    }
  }
  return boundIntentLabel(tail.slice(start));
}

/**
 * A foreground subagent still running. Its card is a live surface of its own:
 * the ticker and the terminal error/stop state come from the subagent progress
 * atom, not from the outer tool-call part, so a folded header could not follow
 * it. The span stays unfolded until the subagent settles.
 */
function isLiveSubagent(part: TMessageContentParts): boolean {
  const toolCall = getStandardToolCall(part);
  return (
    toolCall?.name === Constants.SUBAGENT &&
    (toolCall.output?.length ?? 0) === 0 &&
    toolCall.progress !== 1 &&
    toolCall.runStepStatus == null
  );
}

/** True when a live fold cannot stand for this part right now. */
export function blocksLiveFold(part: TMessageContentParts | undefined): boolean {
  if (part == null) {
    return false;
  }
  return needsReader(part) || isLiveSubagent(part);
}

/** Icons the header stack can show. */
const MAX_LIVE_ICONS = 4;

/** How far back from the tail the icon scan looks. This runs on every streamed
 *  delta, so its cost must not grow with the run; the stack then shows the
 *  tools of the recent stretch, which is also what the line beside it names. */
const LIVE_ICON_WINDOW = 24;

/**
 * Tool names for a span's icon stack, oldest first, read from a fixed window
 * behind the tail so the cost does not grow with the run.
 */
export function getSpanIconNames(parts: ReadonlyArray<TMessageContentParts | undefined>): string[] {
  const icons = new Set<string>();
  const floor = Math.max(0, parts.length - LIVE_ICON_WINDOW);
  for (let position = parts.length - 1; position >= floor; position -= 1) {
    if (icons.size === MAX_LIVE_ICONS) {
      break;
    }
    const part = parts[position];
    const toolCall = part == null ? undefined : getStandardToolCall(part);
    if (toolCall != null) {
      const name = toolCall.name ?? '';
      icons.add(isBashProgrammaticToolCall(name, toolCall.args) ? Tools.bash_tool : name);
      continue;
    }
    const legacy = part == null ? null : getToolMeta(part);
    if (legacy != null) {
      icons.add(legacy.iconName);
    }
  }
  return Array.from(icons).reverse();
}

/** A call still running whose line is only the generic one: no intent, no
 *  verdict, no background state. */
function isAwaitingStartup(
  part: TMessageContentParts,
  toolCall: LiveToolCall,
  span: SpanSummary,
): boolean {
  const meta = span.metaOf(part);
  return (
    toolCall.id != null &&
    meta != null &&
    !meta.hasOutput &&
    !meta.failed &&
    !meta.cancelled &&
    meta.background == null &&
    getToolCallIntent(toolCall.args) == null
  );
}

function toolIdentity(toolCall: LiveToolCall): string {
  const name = toolCall.name ?? '';
  return isBashProgrammaticToolCall(name, toolCall.args) ? Tools.bash_tool : name;
}

/** Counts the current tool and the same actions immediately preceding it.
 *  Reasoning and activity labels describe those actions, so they do not break
 *  a combo; encountering another tool does. */
function consecutiveToolCount(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  position: number,
  toolCall: LiveToolCall,
): number {
  const identity = toolIdentity(toolCall);
  let count = 1;
  for (let index = position - 1; index >= 0; index -= 1) {
    const previousPart = parts[index];
    const previous = previousPart == null ? undefined : getStandardToolCall(previousPart);
    if (previous == null) {
      continue;
    }
    if (toolIdentity(previous) !== identity) {
      break;
    }
    count += 1;
  }
  return count;
}

function newestLine(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
  span: SpanSummary,
): Pick<LiveActivity, 'text' | 'source' | 'pendingToolCallId' | 'comboCount'> {
  for (let position = parts.length - 1; position >= 0; position -= 1) {
    const part = parts[position];
    if (part == null) {
      continue;
    }
    if (part.type === ContentTypes.THINK) {
      /** Reached before any call or label, this thought IS the tail — the
       *  model is reasoning about its next step. Its multi-line peek stays
       *  inside the fold, so the header previews it one sentence at a time. */
      const reasoning = typeof part.think === 'string' ? part.think : (part.think?.value ?? '');
      const sentence = lastReasoningSentence(reasoning);
      if (sentence != null) {
        return { text: sentence, source: `think:${position}`, comboCount: 1 };
      }
      const label = part.reasoning_label?.trim();
      if (label || reasoning.trim()) {
        return {
          text: label || localize('com_ui_thinking'),
          source: `think:${position}`,
          comboCount: 1,
        };
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
        return { text: commentary, source: `text:${position}`, comboCount: 1 };
      }
      continue;
    }
    const labelText = getActivityLabelText(getBatchActivityLabelPart(part));
    if (labelText) {
      return { text: labelText, source: `label:${position}`, comboCount: 1 };
    }
    const toolCall = getStandardToolCall(part);
    if (toolCall != null) {
      return {
        text: toolCallLine(part, toolCall, localize, serverNames, span),
        /** Provider ids repeat across batches, so the position is part of the
         *  identity: a second call reusing an id is a new line, not the first
         *  one still growing. */
        source: `tool:${toolCall.id ?? ''}:${position}`,
        comboCount: consecutiveToolCount(parts, position, toolCall),
        ...(isAwaitingStartup(part, toolCall, span) && { pendingToolCallId: toolCall.id }),
      };
    }
  }
  return { text: '', source: '', comboCount: 1 };
}

/**
 * The newest nameable activity in a span: the last tool call's own line (its
 * streamed intent, else the generic text its card would show), a filled batch
 * label once one lands after it, or the thought streaming after both. Later parts win, so the
 * header always reads as the bottom line of the list it stands for.
 *
 * Runs on every streamed delta. Outcome aggregation visits the full span so
 * late failures cannot disappear; the line stops at the newest nameable part
 * and icons only inspect a fixed tail window.
 */
export function getLiveActivity(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
  attachmentsById?: Record<string, TAttachment[] | undefined>,
): LiveActivity {
  const span = summarizeSpan(parts, attachmentsById);
  return {
    ...newestLine(parts, localize, serverNames, span),
    outcome: { failed: span.failed, cancelled: span.cancelled },
    iconNames: getSpanIconNames(parts),
  };
}
