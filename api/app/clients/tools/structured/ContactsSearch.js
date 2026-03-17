const { StructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const { getContacts } = require('~/models');

class ContactsSearch extends StructuredTool {
  constructor(fields = {}) {
    super();
    this.name = 'contacts_search';
    this.description = 'Search and retrieve information about a user`s saved contacts. Useful for finding a person`s role, company, email, notes, or arbitrary attributes. Use realistic search queries based on what the user is asking. Can search by name, company, or role. Leave the parameter blank to return all contacts, but preferably use search keywords to limit results.';
    
    // In LibreChat, tools often get instantiated per request context where `userId` can be passed
    this.userId = fields.userId || process.env.USER_ID; 

    this.schema = z.object({
      query: z.string().describe('The search term to look for in contacts (name, company, role, email). E.g., "John Doe" or "Software Engineer"'),
    });
  }

  async _call({ query }) {
    if (!this.userId) {
      return 'Error: userId is missing or the user is not authenticated.';
    }

    try {
      // Fetch user's contacts
      const contacts = await getContacts({ user: this.userId });
      
      if (!contacts || contacts.length === 0) {
        return 'No contacts found.';
      }

      const q = query ? query.toLowerCase() : '';

      // Filter based on query loosely matching name, company, role, email, notes
      const matchedContacts = contacts.filter((c) => {
        if (!q) return true;
        const searchStr = `${c.name || ''} ${c.company || ''} ${c.role || ''} ${c.email || ''} ${c.notes || ''}`.toLowerCase();
        
        // Also include attributes in string
        let attrsStr = '';
        if (c.attributes) {
            attrsStr = Object.values(c.attributes).join(' ').toLowerCase();
        }

        return searchStr.includes(q) || attrsStr.includes(q);
      });

      if (matchedContacts.length === 0) {
        return `No contacts found matching the query: "${query}".`;
      }

      // Format output for the LLM
      const formattedContacts = matchedContacts.map((c) => {
          let output = `Name: ${c.name}\n`;
          if (c.company) output += `Company: ${c.company}\n`;
          if (c.role) output += `Role: ${c.role}\n`;
          if (c.email) output += `Email: ${c.email}\n`;
          if (c.notes) output += `Notes: ${c.notes}\n`;
          
          if (c.attributes && Object.keys(c.attributes).length > 0) {
             output += `Other Attributes:\n`;
             for (const [key, value] of Object.entries(c.attributes)) {
                 output += `  - ${key}: ${value}\n`;
             }
          }
          return output.trim();
      }).join('\n\n---\n\n');

      return `Found ${matchedContacts.length} contacts matching "${query}":\n\n${formattedContacts}`;
    } catch (error) {
      console.error('ContactsSearch Tool Error:', error);
      return `Error retrieving contacts: ${error.message}`;
    }
  }
}

module.exports = ContactsSearch;
