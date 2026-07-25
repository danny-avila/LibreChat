import type { TextContentFragment } from '../types';
import { getReferencedQuoteEntries, mergeQuotedText } from '../../utils/quotes';

export interface ChatSubmissionDecision {
  readonly responseText?: string;
  readonly reason?: string;
  readonly editedArguments?: unknown;
}

export interface ChatSubmissionBody {
  readonly text?: string;
  readonly quotes?: unknown;
  readonly answer?: string;
  readonly decisions?: readonly (ChatSubmissionDecision | null | undefined)[];
}

function createFragment(
  id: string,
  path: TextContentFragment['path'],
  text: string,
  source: TextContentFragment['source'],
  format: TextContentFragment['format'] = 'plain',
  treatment: TextContentFragment['treatment'] = 'replaceable',
): TextContentFragment {
  return {
    id,
    path,
    text,
    source,
    format,
    treatment,
    provenance: 'user',
  };
}

export function extractChatContent(
  body: ChatSubmissionBody | null | undefined,
): readonly TextContentFragment[] {
  const fragments: TextContentFragment[] = [];
  const text = typeof body?.text === 'string' ? body.text : '';

  if (text.length > 0) {
    fragments.push(createFragment('chat.text', '/text', text, 'message'));
  }

  const quoteEntries = getReferencedQuoteEntries(body?.quotes);
  if (quoteEntries != null) {
    const quotes: string[] = [];
    for (const quote of quoteEntries) {
      quotes.push(quote.text);
      fragments.push(
        createFragment(
          `chat.quote.${quote.sourceIndex}`,
          `/quotes/${quote.sourceIndex}`,
          quote.text,
          'message',
        ),
      );
    }
    fragments.push(
      createFragment(
        'chat.assembled.quote-text',
        '/$assembled/quote-text',
        mergeQuotedText(text, quotes),
        'assembled_context',
        'markdown',
        'inspect_only',
      ),
    );
  }

  if (typeof body?.answer === 'string' && body.answer.length > 0) {
    fragments.push(createFragment('chat.answer', '/answer', body.answer, 'message'));
  }

  if (!Array.isArray(body?.decisions)) {
    return fragments;
  }

  for (let index = 0; index < body.decisions.length; index++) {
    const decision = body.decisions[index];
    if (typeof decision?.responseText === 'string' && decision.responseText.length > 0) {
      fragments.push(
        createFragment(
          `chat.decision.${index}.response`,
          `/decisions/${index}/responseText`,
          decision.responseText,
          'message',
        ),
      );
    }
    if (typeof decision?.reason === 'string' && decision.reason.length > 0) {
      fragments.push(
        createFragment(
          `chat.decision.${index}.reason`,
          `/decisions/${index}/reason`,
          decision.reason,
          'message',
        ),
      );
    }
    if (decision?.editedArguments == null) {
      continue;
    }
    try {
      const editedArguments = JSON.stringify(decision.editedArguments);
      if (typeof editedArguments !== 'string' || editedArguments.length === 0) {
        continue;
      }
      fragments.push(
        createFragment(
          `chat.decision.${index}.arguments`,
          `/decisions/${index}/editedArguments`,
          editedArguments,
          'tool_argument',
          'json',
          'inspect_only',
        ),
      );
    } catch {
      continue;
    }
  }

  return fragments;
}
