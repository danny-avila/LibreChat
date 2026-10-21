import type { Agents } from 'librechat-data-provider';

/** Action ids of questions written as a ```questions block in the reply text (Law Chat),
 *  as opposed to an agent's `ask_user_question` pause: answers go back as a chat message. */
export const TEXT_ASK_PREFIX = 'text:';

const BLOCK = /```questions\s*\n([\s\S]*?)```/g;

type RawQuestion = { question?: unknown; options?: unknown; multiple?: unknown };

/** The questions of the last complete ```questions block, or null (also while it still streams). */
export function parseQuestions(text: string): Agents.AskUserQuestionBatchItem[] | null {
  const blocks = [...text.matchAll(BLOCK)];
  const body = blocks[blocks.length - 1]?.[1];
  if (body == null) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) {
    return null;
  }
  const items = (list as RawQuestion[])
    .filter((q) => typeof q?.question === 'string' && q.question.trim() !== '')
    .slice(0, 6)
    .map((q, i) => {
      const question = (q.question as string).trim();
      const options = Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
        : [];
      return {
        // the id doubles as the answer's label in the chat message
        id: `${i + 1}. ${question}`,
        question,
        options: options.slice(0, 8).map((o) => ({ label: o.trim(), value: o.trim() })),
        multiSelect: q.multiple === true,
      };
    });
  return items.length > 0 ? items : null;
}

/** The chat message that answers a batch: one "question: answer" line each. */
export function formatAnswers(answers: Record<string, string>): string {
  return Object.entries(answers)
    .map(([question, answer]) => `${question}\n→ ${answer}`)
    .join('\n\n');
}
