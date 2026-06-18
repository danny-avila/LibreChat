import { Tools, replaceSpecialVars } from 'librechat-data-provider';

/** Builds the web search tool context with citation format instructions. */
export function buildWebSearchContext(): string {
  return `# \`${Tools.web_search}\`:
**Default: answer from your own knowledge.** Most messages do not need a search, so do not reach for this tool by reflex.

A search is justified ONLY if you can name a concrete reason from this list. If none clearly applies, do not search:
- The answer depends on information that changes over time and could be stale (today's news, prices, weather, schedules, standings, current office-holders, latest version numbers).
- The user asks about a specific recent event or release, or anything dated after your knowledge cutoff.
- The user explicitly asks you to search, or gives a link or source to read.
- The answer hinges on niche, local, or hard-to-verify specifics you are genuinely unsure of (a specific business's hours, an obscure spec, a person who isn't widely documented).
- You gave an answer and have real reason to believe it is outdated or wrong.

Do NOT search for things you can already handle: definitions, concepts, explanations, reasoning, math, code, translation, writing, summarizing the user's own text, general how-tos, or opinions. The fact that a search might return relevant-looking results is NOT a reason to search — only the gaps above are.

When you are unsure whether you know enough, answer from your knowledge and state what you're uncertain about, instead of defaulting to a search. An unnecessary search adds latency and noise and is worse than a direct answer.

If — and only if — a trigger above applies: search once, immediately, without preface, then provide a brief summary addressing the query directly, and structure your response with clear Markdown formatting (## headers, lists, tables). Cite sources properly, tailor tone to query type, and provide comprehensive details.

Use the conversation date/time from the dynamic runtime context when recency matters.

**CITATION FORMAT - UNICODE ESCAPE SEQUENCES ONLY:**
Use these EXACT escape sequences (copy verbatim): \\ue202 (before each anchor), \\ue200 (group start), \\ue201 (group end), \\ue203 (highlight start), \\ue204 (highlight end)

Anchor pattern: \\ue202turn{N}{type}{index} where N=turn number, type=search|news|image|ref, index=0,1,2...

**Examples (copy these exactly):**
- Single: "Statement.\\ue202turn0search0"
- Multiple: "Statement.\\ue202turn0search0\\ue202turn0news1"
- Group: "Statement. \\ue200\\ue202turn0search0\\ue202turn0news1\\ue201"
- Highlight: "\\ue203Cited text.\\ue204\\ue202turn0search0"
- Image: "See photo\\ue202turn0image0."

**CRITICAL:** Output escape sequences EXACTLY as shown. Do NOT substitute with † or other symbols. Place anchors AFTER punctuation. Cite every non-obvious fact/quote. NEVER use markdown links, [1], footnotes, or HTML tags.`.trim();
}

/** Builds dynamic web search context scoped to the conversation anchor time. */
export function buildWebSearchDynamicContext(now?: string | number | Date): string {
  return `# \`${Tools.web_search}\` Runtime Context
Conversation Date & Time: ${replaceSpecialVars({ text: '{{iso_datetime}}', now })}`.trim();
}
