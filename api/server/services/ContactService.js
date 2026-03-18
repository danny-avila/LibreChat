// api/server/services/ContactService.js
const Contact = require('~/db/Contact');
const { logger } = require('@librechat/data-schemas');

/**
 * Extracts search terms from a user message for contact retrieval.
 * Looks for company names, person names, roles, and general keywords.
 */
function extractSearchTerms(message) {
  if (!message || typeof message !== 'string') return null;
  const cleaned = message.trim();
  if (cleaned.length < 3) return null;
  return cleaned;
}

/**
 * Formats a contact into a compact string for prompt injection.
 */
function formatContact(contact) {
  const parts = [`- ${contact.name}`];
  if (contact.role) parts[0] += `, ${contact.role}`;
  if (contact.company) parts[0] += ` at ${contact.company}`;
  if (contact.email) parts.push(`  Email: ${contact.email}`);
  if (contact.notes) parts.push(`  Notes: ${contact.notes}`);

  // Include arbitrary attributes
  if (contact.attributes) {
    const attrs = contact.attributes instanceof Map
      ? Object.fromEntries(contact.attributes)
      : contact.attributes;
    for (const [key, val] of Object.entries(attrs)) {
      if (val) parts.push(`  ${key}: ${val}`);
    }
  }

  return parts.join('\n');
}

/**
 * Retrieves relevant contacts for a user query using MongoDB text search.
 * Falls back to recent contacts if no specific match found.
 *
 * @param {string} userId - The user's ID
 * @param {string} userMessage - The user's chat message
 * @param {number} limit - Max contacts to return (default 20)
 * @returns {Promise<string|null>} Formatted contact context string, or null
 */
async function getContactContext(userId, userMessage, limit = 20) {
  try {
    const searchTerms = extractSearchTerms(userMessage);
    if (!searchTerms) return null;

    const isContactQuery = /contact|who |what.*know|list|find|work|email|role|company|colleague/i
      .test(userMessage);

    if (!isContactQuery) return null;

    let contacts = [];

    // Try full-text search first
    try {
      contacts = await Contact.find(
        { userId, $text: { $search: searchTerms } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean();
    } catch {
      // Text index might not be ready yet, fall through
    }

    // Fallback: regex search on key fields if text search returns nothing
    if (contacts.length === 0) {
      const words = searchTerms
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 5);

      if (words.length > 0) {
        const regexes = words.map((w) => new RegExp(w, 'i'));
        contacts = await Contact.find({
          userId,
          $or: [
            { name: { $in: regexes } },
            { company: { $in: regexes } },
            { role: { $in: regexes } },
            { notes: { $in: regexes } },
          ],
        })
          .limit(limit)
          .lean();
      }
    }

    if (contacts.length === 0) return null;

    const formatted = contacts.map(formatContact).join('\n\n');
    return `# Relevant Contacts from User's Contact List:\n${formatted}`;
  } catch (err) {
    logger.error('[ContactService] getContactContext error:', err);
    return null;
  }
}

module.exports = { getContactContext };