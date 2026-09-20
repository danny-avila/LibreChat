import { Tools, ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TAttachment,
  PartMetadata,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks';
import { getBatchActivityLabelPart, getActivityLabelText } from '~/utils/activityLabels';
import { hasPendingApprovalInPart, hasPendingAuthInPart } from '~/utils/groupToolCalls';
import { ASK_USER_QUESTION, getSubmittedAskAnswer } from '~/utils/approval';
import { boundIntentLabel, getToolCallIntent } from './Parts/intent';
import { getToolDisplayLabel } from '~/utils/toolLabels';
import { isBashProgrammaticToolCall } from './routing';
import { getToolMeta } from './outcome';

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
  part: TMessageContentParts,
  toolCall: LiveToolCall,
  localize: Localize,
  serverNames: readonly string[],
  attachments?: TAttachment[],
): string {
  const intent = getToolCallIntent(toolCall.args);
  const label = getToolDisplayLabel(toolCall.name ?? '', localize, serverNames);
  /** The verdict comes from the resolver the group header uses, so a collapsed
   *  row can never read as a success while the card it hides shows a failure
   *  or a stop — whichever channel reported it. */
  const meta = getToolMeta(part, { [toolCall.id ?? '']: attachments });
  if (meta?.cancelled === true) {
    return localize('com_ui_cancelled');
  }
  if (meta?.failed === true) {
    /** Reads exactly as the hidden card does (`ToolCall`'s finished text). */
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
    meta?.hasOutput === true ? 'com_assistants_completed_function' : 'com_assistants_running_var',
    { 0: label },
  );
}

/** Bounds the sentence scan on long reasoning, like the streaming peek. */
const REASONING_TAIL_CHARS = 1200;

/**
 * The sentence a streaming thought is currently writing, with its offset in
 * the full text. The offset is the line's identity: it holds still while the
 * sentence grows, so the header extends it in place, and moves when the next
 * sentence starts, so the header ticks over — a line-by-line preview in a
 * single row.
 */
function lastReasoningSentence(reasoning: string): { text: string; offset: number } | undefined {
  const body = reasoning.replace(/^\s*<think>\s*/, '').replace(/\s*<\/think>\s*$/, '');
  const tail = body.slice(-REASONING_TAIL_CHARS).trimEnd();
  if (!tail) {
    return undefined;
  }
  let start = 0;
  const boundary = /[.!?]\s+/g;
  for (let match = boundary.exec(tail); match != null; match = boundary.exec(tail)) {
    start = match.index + match[0].length;
  }
  const text = boundIntentLabel(tail.slice(start));
  return text == null ? undefined : { text, offset: body.length - tail.length + start };
}

/** Icons the header stack can show. */
const MAX_LIVE_ICONS = 4;

/** How far back from the tail the icon scan looks. This runs on every streamed
 *  delta, so its cost must not grow with the run; the stack then shows the
 *  tools of the recent stretch, which is also what the line beside it names. */
const LIVE_ICON_WINDOW = 24;

function newestLine(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
  attachments?: TAttachment[],
): Pick<LiveActivity, 'text' | 'source'> {
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
        return { text: sentence.text, source: `think:${position}:${sentence.offset}` };
      }
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
        text: toolCallLine(part, toolCall, localize, serverNames, attachments),
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
 * stops at the first nameable part from the tail, and the icons look at a
 * fixed window behind it.
 */
export function getLiveActivity(
  parts: ReadonlyArray<TMessageContentParts | undefined>,
  localize: Localize,
  serverNames: readonly string[],
  attachments?: TAttachment[],
): LiveActivity {
  const icons = new Set<string>();
  const floor = Math.max(0, parts.length - LIVE_ICON_WINDOW);
  for (let position = parts.length - 1; position >= floor; position -= 1) {
    if (icons.size === MAX_LIVE_ICONS) {
      break;
    }
    const part = parts[position];
    const toolCall = part == null ? undefined : getStandardToolCall(part);
    if (toolCall == null) {
      continue;
    }
    const name = toolCall.name ?? '';
    icons.add(isBashProgrammaticToolCall(name, toolCall.args) ? Tools.bash_tool : name);
  }
  return {
    ...newestLine(parts, localize, serverNames, attachments),
    iconNames: Array.from(icons).reverse(),
  };
}
