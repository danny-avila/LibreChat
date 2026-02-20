const axios = require('axios');
const { addMemoryEntry, getProjectMemory } = require('~/models/Project');
const logger = require('~/config/winston');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const MEMORY_EXTRACTION_MODEL = process.env.MEMORY_EXTRACTION_MODEL || 'llama3.1:8b';

const EXTRACTION_PROMPT = `You are a memory extraction assistant. Given a user message and an AI response from a conversation, extract key facts worth remembering for future conversations in this project.

Extract facts such as:
- User preferences (coding style, language preferences, tools used)
- Technical decisions (architecture choices, frameworks, deployment targets)
- Project details (names, URLs, configurations, team members)
- Important constraints or requirements mentioned
- Domain-specific knowledge shared

Rules:
- Only extract clear, factual statements — not opinions or speculation
- Keep each fact concise (one sentence)
- Do not extract conversational pleasantries or generic statements
- Return a JSON array of strings, each being one fact
- If there are no noteworthy facts, return an empty array []
- Maximum 5 facts per exchange

Example output: ["User prefers TypeScript over JavaScript", "The project uses PostgreSQL for the database"]

User message:
{USER_MESSAGE}

AI response:
{ASSISTANT_MESSAGE}

Extract the key facts as a JSON array:`;

/**
 * Extract memory entries from a user/assistant exchange and save to the project.
 *
 * @param {Object} params
 * @param {string} params.projectId - The project's ID.
 * @param {string} params.user - The user's ID.
 * @param {string} params.userMessage - The user's message text.
 * @param {string} params.assistantMessage - The assistant's response text.
 * @param {string} params.messageId - The message ID for attribution.
 */
async function extractMemoryFromExchange({ projectId, user, userMessage, assistantMessage, messageId }) {
  try {
    if (!userMessage || !assistantMessage) {
      return;
    }

    // Truncate long messages to keep prompt manageable
    const maxChars = 3000;
    const truncatedUser = userMessage.length > maxChars
      ? userMessage.substring(0, maxChars) + '...'
      : userMessage;
    const truncatedAssistant = assistantMessage.length > maxChars
      ? assistantMessage.substring(0, maxChars) + '...'
      : assistantMessage;

    const prompt = EXTRACTION_PROMPT
      .replace('{USER_MESSAGE}', truncatedUser)
      .replace('{ASSISTANT_MESSAGE}', truncatedAssistant);

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
      model: MEMORY_EXTRACTION_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500,
      },
    }, {
      timeout: 30000,
    });

    const content = response.data?.message?.content;
    if (!content) {
      logger.debug('[ProjectMemoryService] No content in extraction response');
      return;
    }

    // Parse JSON array from response — handle markdown code fences
    let facts;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      facts = JSON.parse(cleaned);
    } catch (parseError) {
      // Try to extract JSON array from the response
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          facts = JSON.parse(match[0]);
        } catch {
          logger.debug('[ProjectMemoryService] Failed to parse extraction response', { content });
          return;
        }
      } else {
        logger.debug('[ProjectMemoryService] No JSON array found in response', { content });
        return;
      }
    }

    if (!Array.isArray(facts) || facts.length === 0) {
      return;
    }

    // Deduplicate against existing memory
    const existingMemory = await getProjectMemory(projectId, user);
    const existingContents = existingMemory.map((e) => e.content.toLowerCase());

    const newFacts = facts
      .filter((fact) => typeof fact === 'string' && fact.trim())
      .filter((fact) => {
        const lower = fact.toLowerCase();
        return !existingContents.some(
          (existing) => existing.includes(lower) || lower.includes(existing),
        );
      })
      .slice(0, 5);

    for (const fact of newFacts) {
      await addMemoryEntry(projectId, user, {
        content: fact.trim(),
        source: 'auto',
        extractedFrom: messageId,
        category: 'general',
      });
    }

    if (newFacts.length > 0) {
      logger.debug(`[ProjectMemoryService] Extracted ${newFacts.length} memory entries for project ${projectId}`);
    }
  } catch (error) {
    // Log but never throw — this is fire-and-forget
    logger.error('[ProjectMemoryService] Error extracting memory', {
      projectId,
      error: error.message,
    });
  }
}

module.exports = { extractMemoryFromExchange };
