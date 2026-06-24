/**
 * System-prompt instruction that lets the model offer clickable reply chips.
 * The frontend parses the trailing `<suggestions>` block out of the reply
 * (`extractSuggestions` in packages/data-provider/src/parsers.ts) and renders
 * the array as buttons; the tag itself is never shown to the user.
 *
 * Intentionally permissive ("only when helpful") so chips appear when the
 * model is genuinely offering options, not on every turn.
 */
export const SUGGESTIONS_PROMPT = `When you are helping the user work through a problem and offering likely next steps or a choice between options would genuinely help them move forward, you may end your reply with a hidden suggestions block. Put it on its own line at the very end, formatted EXACTLY as:
<suggestions>["First option","Second option","Third option"]</suggestions>
Rules:
- Include 2-4 suggestions, each a short phrase under ~8 words written as the user would say it.
- Only include the block when picking among options or next steps is genuinely useful. Omit it for simple factual answers, or when you are asking a single open-ended question.
- The block is stripped from your visible reply and rendered as clickable chips, so never reference "the suggestions below" in your prose.`;
