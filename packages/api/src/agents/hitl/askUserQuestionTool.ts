import { z } from 'zod';
import { askUserQuestion } from '@librechat/agents';
import { tool } from '@librechat/agents/langchain/tools';
import type { DynamicStructuredTool } from '@librechat/agents/langchain/tools';

/**
 * Tool name. Deliberately identical to the SDK's interrupt discriminator
 * (`AskUserQuestionInterruptPayload.type === 'ask_user_question'`) and the client
 * content-part type the merged question card renders — the whole pipeline keys on
 * this one string.
 */
export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';

/**
 * Length caps double as the sanitization story: every one of these strings is
 * model-generated and rendered verbatim (as text nodes — React escapes) in the
 * client question card, so bound them here rather than trusting the model.
 */
const QUESTION_MAX = 2000;
const DESCRIPTION_MAX = 4000;
const OPTION_LABEL_MAX = 120;
const OPTION_VALUE_MAX = 500;
const OPTIONS_MAX = 12;

const ASK_USER_QUESTION_DESCRIPTION = [
  'Ask the user a clarifying question and pause the run until they answer; their answer is',
  "returned as this tool's result. Use it only when you are genuinely blocked on a decision",
  'you cannot resolve from the conversation or your other tools. Ask exactly ONE question per',
  'turn, and NEVER call this tool in parallel with any other tool call. When the realistic',
  'answers are enumerable, provide 2-6 concise options; set multiSelect to true only when',
  'several options may sensibly apply at once (the selected option values are returned joined',
  'by ", "). The user can always type a free-form answer instead — so do NOT include a',
  "catch-all option like 'Other' or 'Something else': the answer UI always offers free-form",
  'input on its own.',
].join(' ');

/**
 * Mirrors the SDK's `AskUserQuestionRequest` (question / description? / options?) — the
 * validated input is passed to `askUserQuestion()` unchanged, so this schema IS the wire
 * shape the client card receives inside the pendingAction payload.
 */
export const askUserQuestionToolSchema: z.ZodObject<
  {
    question: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<
      z.ZodArray<z.ZodObject<{ label: z.ZodString; value: z.ZodString }, 'strip'>, 'many'>
    >;
    multiSelect: z.ZodOptional<z.ZodBoolean>;
  },
  'strip'
> = z.object({
  question: z
    .string()
    .min(1)
    .max(QUESTION_MAX)
    .describe('The single clarifying question to ask the user.'),
  description: z
    .string()
    .max(DESCRIPTION_MAX)
    .optional()
    .describe('Optional context rendered alongside the question (why you are asking).'),
  options: z
    .array(
      z.object({
        label: z
          .string()
          .min(1)
          .max(OPTION_LABEL_MAX)
          .describe('Human-readable choice shown to the user.'),
        value: z
          .string()
          .min(1)
          .max(OPTION_VALUE_MAX)
          .describe('Value returned as the answer if this option is picked.'),
      }),
    )
    .max(OPTIONS_MAX)
    .optional()
    .describe(
      'Optional pre-defined choices (2-6 recommended). Omit to require a free-form answer.',
    ),
  multiSelect: z
    .boolean()
    .optional()
    .describe('Allow the user to pick several options; their values are returned joined by ", ".'),
});

export type AskUserQuestionToolInput = z.infer<typeof askUserQuestionToolSchema>;

/** Explicit shape of {@link AskUserQuestionToolDefinition} (isolatedDeclarations). */
export interface AskUserQuestionToolDefinitionShape {
  name: string;
  description: string;
  schema: {
    type: 'object';
    properties: {
      question: { type: 'string'; minLength: number; maxLength: number; description: string };
      description: { type: 'string'; maxLength: number; description: string };
      options: {
        type: 'array';
        maxItems: number;
        description: string;
        items: {
          type: 'object';
          properties: {
            label: { type: 'string'; minLength: number; maxLength: number; description: string };
            value: { type: 'string'; minLength: number; maxLength: number; description: string };
          };
          required: string[];
        };
      };
      multiSelect: { type: 'boolean'; description: string };
    };
    required: string[];
  };
}

/**
 * JSON-schema twin of {@link askUserQuestionToolSchema} for the schema-only tool
 * registry (`agentToolDefinitions` in `tools/registry/definitions.ts`), same shape the
 * Calculator/WebSearch builtin definitions use.
 */
export const AskUserQuestionToolDefinition: AskUserQuestionToolDefinitionShape = {
  name: ASK_USER_QUESTION_TOOL_NAME,
  description: ASK_USER_QUESTION_DESCRIPTION,
  schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        minLength: 1,
        maxLength: QUESTION_MAX,
        description: 'The single clarifying question to ask the user.',
      },
      description: {
        type: 'string',
        maxLength: DESCRIPTION_MAX,
        description: 'Optional context rendered alongside the question (why you are asking).',
      },
      options: {
        type: 'array',
        maxItems: OPTIONS_MAX,
        description:
          'Optional pre-defined choices (2-6 recommended). Omit to require a free-form answer.',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              minLength: 1,
              maxLength: OPTION_LABEL_MAX,
              description: 'Human-readable choice shown to the user.',
            },
            value: {
              type: 'string',
              minLength: 1,
              maxLength: OPTION_VALUE_MAX,
              description: 'Value returned as the answer if this option is picked.',
            },
          },
          required: ['label', 'value'],
        },
      },
      multiSelect: {
        type: 'boolean',
        description:
          'Allow the user to pick several options; their values are returned joined by ", ".',
      },
    },
    required: ['question'],
  },
};

/**
 * Create the `ask_user_question` tool instance. The func calls the SDK's
 * `askUserQuestion()` helper, which raises a LangGraph `interrupt()` — on the first
 * pass execution unwinds (the run pauses; `run.getInterrupt().payload.type ===
 * 'ask_user_question'`), and on the resume pass it returns the host-supplied
 * `{ answer }`, which becomes the ToolMessage content the model sees.
 *
 * Requirements at the run level (wired in `agents/run.ts`): a checkpointer must be
 * attached (the interrupt must be durable to be resumable) and the tool must be
 * excluded from eager event execution (an interrupt raised outside the Pregel task
 * frame cannot pause the run). It does NOT require the tool-approval policy
 * (`humanInTheLoop`/hooks) — verified end-to-end in
 * `api/server/controllers/agents/__tests__/askUserQuestion.e2e.spec.js`.
 *
 * LangGraph resume contract (documented on the SDK helper): the tool body re-runs
 * from the top on the resume pass, and sibling tools in the same batch re-execute —
 * which is why the description forbids parallel calls.
 */
export function createAskUserQuestionTool(): DynamicStructuredTool<
  typeof askUserQuestionToolSchema
> {
  return tool(
    async (input: AskUserQuestionToolInput) => {
      const { answer } = askUserQuestion(input);
      return answer;
    },
    {
      name: ASK_USER_QUESTION_TOOL_NAME,
      description: ASK_USER_QUESTION_DESCRIPTION,
      schema: askUserQuestionToolSchema,
    },
  );
}
