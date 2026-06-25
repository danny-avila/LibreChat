/**
 * System-prompt instruction that lets the model offer a "save to memory" banner.
 * The frontend parses the trailing `<memory>` block out of the reply
 * (`extractMemory` in packages/data-provider/src/parsers.ts) and renders it as
 * an editable banner; the tag itself is never shown to the user.
 *
 * Only injected when memory is enabled for the request. Intentionally
 * conservative ("only when genuinely useful") so the banner appears when the
 * user shares durable personal info, not on every turn.
 */
export const MEMORY_PROMPT = `When the user shares durable personal information worth remembering about themselves (such as their preferences, role or work context, ongoing projects, or stable interests), you may end your reply with a hidden memory block. Put it on its own line at the very end, formatted EXACTLY as:
<memory key="preferences">The user prefers dark mode and concise answers.</memory>
Rules:
- The \`key\` MUST be exactly one of: preferences, work_info, personal_info, skills, interests, context, brand_context. Pick the single best fit.
- Write the value as one concise fact in the third person ("The user ..."), capturing only what is genuinely durable and useful to remember later.
- Include at most one block, and only when the user has actually shared something worth remembering. Omit it for transient requests, simple factual questions, or when nothing durable was shared.
- The block is stripped from your visible reply and shown as an editable "Save to memory?" banner, so never reference it in your prose.`;
