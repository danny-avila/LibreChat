/**
 * Profile Extractor - Extracts structured user profile data from conversations
 * Uses LLM to identify and categorize user information into the 15-category schema
 */

/**
 * Valid profile category names
 */
export const PROFILE_CATEGORIES = [
  'identity',
  'personality',
  'values',
  'goals',
  'interests',
  'relationships',
  'emotional',
  'communication',
  'thinking',
  'daily_life',
  'current_context',
  'self_perception',
  'boundaries',
  'history',
  'meta_behavior',
] as const;

export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];

/**
 * Profile extraction result type
 */
export interface ProfileExtractionResult {
  [category: string]: {
    [field: string]: string | number | string[] | undefined;
  };
}

/**
 * System prompt for profile extraction
 * Instructs the LLM to extract ONLY explicitly stated information
 */
export const PROFILE_EXTRACTION_PROMPT = `You are a profile extraction system. Given a conversation, identify any NEW information about the user that fits the categories below.

CRITICAL RULES:
1. ONLY extract EXPLICITLY stated information - NEVER assume or infer
2. Use abbreviated/compressed values (e.g., "SF" not "San Francisco, California")
3. Use numeric scales (-1 to 1) for spectrum fields (e.g., introversion, optimism)
4. Return ONLY fields with NEW information from THIS conversation
5. Max 50 chars per string value
6. Max 5 items per array
7. If NO extractable information exists, return empty object: {}

CATEGORIES AND FIELDS:

1. identity: Basic demographic info
   - age (number), location (string), occupation (string), education (string)
   - family (string), languages (string[]), cultural_bg (string)

2. personality: Stable traits (use -1 to 1 scale)
   - introversion (-1=extrovert, 1=introvert)
   - planning (-1=spontaneous, 1=planner)
   - optimism (-1=pessimist, 1=optimist)
   - risk_tolerance (-1=risk-averse, 1=risk-taker)
   - emotional_logical (-1=emotional, 1=logical)
   - stress_response (string: "withdraw"/"seek_support"/"action")

3. values: Core beliefs
   - priorities (string[]), principles (string[]), success_def (string)
   - non_negotiables (string[]), worldview (string), spirituality (string)

4. goals: Aspirations
   - short_term (string[]), long_term (string[]), dreams (string[])
   - professional (string[]), growth_areas (string[])

5. interests: Passions and hobbies
   - hobbies (string[]), topics (string[]), media (string[])
   - aesthetics (string[]), niche (string[])

6. relationships: Social connections
   - important_people (string[]: "role:name" format)
   - attachment (string: "secure"/"anxious"/"avoidant")
   - social_pref (string: "small_groups"/"one_on_one"/"large")
   - conflict_style (string: "avoid"/"confront"/"compromise")
   - love_language (string: "words"/"acts"/"gifts"/"time"/"touch")

7. emotional: Emotional patterns
   - happy_triggers (string[]), frustrations (string[]), fears (string[])
   - comfort_sources (string[]), pride_points (string[]), vulnerabilities (string[])

8. communication: Interaction preferences
   - channels (string[]), directness (-1 to 1), detail_pref ("concise"/"detailed")
   - tone ("casual"/"formal"/"warm"), feedback_style ("direct"/"sandwich"/"gentle")
   - advice_vs_listen (-1=listen, 1=advice)

9. thinking: Cognitive style
   - learning_style ("visual"/"auditory"/"kinesthetic"/"reading")
   - decision_making ("quick"/"deliberate"/"intuitive")
   - big_picture_detail (-1=detail, 1=big_picture)
   - openness_change (-1=resistant, 1=open)
   - problem_solving ("analytical"/"creative"/"collaborative")

10. daily_life: Routines
    - schedule ("structured"/"flexible"/"chaotic")
    - chronotype ("morning"/"night"/"neither")
    - health_habits (string[]), work_life (-1=work, 1=life)
    - tech_relationship ("heavy"/"moderate"/"minimal")

11. current_context: Present situation
    - life_stage ("student"/"early_career"/"mid_career"/"parent"/"retired")
    - challenges (string[]), recent_events (string[])
    - mood (string), concerns (string[])

12. self_perception: Self-view
    - strengths (string[]), weaknesses (string[])
    - desired_changes (string[]), misunderstandings (string[])
    - confidence (-1 to 1)

13. boundaries: Limits and needs
    - personal (string[]), support_needs (string[])
    - alone_time_needs (string), deal_breakers (string[])
    - respect_triggers (string[])

14. history: Past experiences
    - defining_moments (string[]), influences (string[])
    - hardships (string[]), regrets (string[]), lessons (string[])

15. meta_behavior: Conversation patterns
    - topics_avoid (string[]), topics_love (string[])
    - consistency (string), self_awareness (-1 to 1)
    - disagreement_response ("defensive"/"curious"/"withdraw")
    - assumptions (string[])

OUTPUT FORMAT (JSON only, no explanation):
{
  "category_name": {
    "field_name": value
  }
}

EXAMPLES:

User says: "I'm John, 28, working as a software engineer in NYC"
Output:
{
  "identity": {
    "age": 28,
    "location": "NYC",
    "occupation": "software engineer"
  }
}

User says: "I hate confrontation and prefer to talk things out calmly"
Output:
{
  "relationships": {
    "conflict_style": "avoid"
  },
  "communication": {
    "tone": "calm"
  }
}

User says: "Just chatting about the weather"
Output: {}`;

/**
 * Validates and cleans extracted profile data
 */
export function validateExtraction(
  extraction: Record<string, unknown>,
): ProfileExtractionResult | null {
  if (!extraction || typeof extraction !== 'object') {
    return null;
  }

  const result: ProfileExtractionResult = {};

  for (const [category, fields] of Object.entries(extraction)) {
    // Validate category name
    if (!PROFILE_CATEGORIES.includes(category as (typeof PROFILE_CATEGORIES)[number])) {
      continue;
    }

    if (!fields || typeof fields !== 'object') {
      continue;
    }

    result[category] = {};

    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      // Validate and compress values
      const validatedValue = validateFieldValue(value);
      if (validatedValue !== undefined) {
        result[category][field] = validatedValue;
      }
    }

    // Remove empty categories
    if (Object.keys(result[category]).length === 0) {
      delete result[category];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Validates and compresses individual field values
 */
function validateFieldValue(value: unknown): string | number | string[] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    // Truncate to 50 chars
    return trimmed.slice(0, 50);
  }

  if (typeof value === 'number') {
    // Clamp scale values to -1 to 1
    if (value >= -1 && value <= 1) {
      return Math.round(value * 100) / 100;
    }
    // For non-scale numbers (like age), return as-is if reasonable
    if (value >= 0 && value <= 150) {
      return Math.round(value);
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    const validItems = value
      .filter((item) => typeof item === 'string' && item.trim().length > 0)
      .map((item) => (item as string).trim().slice(0, 50))
      .slice(0, 5);

    return validItems.length > 0 ? validItems : undefined;
  }

  return undefined;
}

/**
 * Parses LLM response to extract JSON
 */
export function parseExtractionResponse(response: string): ProfileExtractionResult | null {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return validateExtraction(parsed);
  } catch {
    return null;
  }
}

/**
 * Determines which profile categories are relevant based on conversation context
 * Used for selective RAG injection
 */
export function determineRelevantCategories(conversationContext: string): string[] {
  const contextLower = conversationContext.toLowerCase();

  const keywordMap: Record<string, string[]> = {
    identity: ['who', 'name', 'where', 'from', 'job', 'work', 'age', 'old', 'live', 'born'],
    personality: ['personality', 'introvert', 'extrovert', 'plan', 'spontaneous', 'optimist'],
    values: ['value', 'important', 'believe', 'principle', 'success', 'priority'],
    goals: ['goal', 'want', 'plan', 'future', 'dream', 'aspire', 'achieve', 'ambition'],
    interests: ['hobby', 'hobbies', 'interest', 'like', 'enjoy', 'passion', 'favorite'],
    relationships: ['friend', 'family', 'partner', 'relationship', 'wife', 'husband', 'parent'],
    emotional: ['feel', 'emotion', 'stress', 'happy', 'sad', 'angry', 'fear', 'worry', 'anxious'],
    communication: ['talk', 'communicate', 'prefer', 'style', 'feedback', 'advice'],
    thinking: ['think', 'decide', 'learn', 'problem', 'solve', 'approach'],
    daily_life: ['routine', 'schedule', 'morning', 'night', 'health', 'exercise', 'work-life'],
    current_context: ['currently', 'right now', 'these days', 'lately', 'challenge', 'struggle'],
    self_perception: ['strength', 'weakness', 'improve', 'confident', 'self'],
    boundaries: ['boundary', 'need', 'limit', 'alone', 'space', 'respect'],
    history: ['past', 'experience', 'learned', 'before', 'used to', 'grew up'],
    meta_behavior: ['avoid', 'topic', 'discuss', 'disagree'],
  };

  const relevant = new Set<string>();

  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((keyword) => contextLower.includes(keyword))) {
      relevant.add(category);
    }
  }

  // Always include current_context and communication for personalization
  relevant.add('current_context');
  relevant.add('communication');
  relevant.add('identity');

  return Array.from(relevant);
}
