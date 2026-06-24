const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  searchOutlookMailMessages,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const microsoftMailJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Optional search query for Outlook mail. Leave empty to list recent messages.',
    },
    page_size: {
      type: 'number',
      description: 'Maximum number of messages to return (1-20). Defaults to 10.',
    },
  },
};

function createNangoServiceInstance() {
  return createNangoService({
    getClient: getNangoClient,
    findNangoConnectionByUserAndProvider: db.findNangoConnectionByUserAndProvider,
    listNangoConnectionsByUserId: db.listNangoConnectionsByUserId,
    listNangoConnectionsByTenantId: db.listNangoConnectionsByTenantId,
    upsertNangoConnection: db.upsertNangoConnection,
    deleteNangoConnectionByUserAndProvider: db.deleteNangoConnectionByUserAndProvider,
  });
}

/**
 * @param {{ user: import('@librechat/data-schemas').IUser }} options
 */
async function createMicrosoftMailTool({ user }) {
  return tool(
    async ({ query, page_size = 10 }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Microsoft 365 integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'microsoft');
        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const result = await searchOutlookMailMessages(token.accessToken, {
          query,
          pageSize,
        });

        return JSON.stringify({
          messages: result.messages,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Outlook mail search failed';
        logger.error('[microsoft_mail] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.microsoft_mail,
      description:
        'Search and list emails in the connected user Outlook mailbox. Returns subject, sender, date, and snippet. The user must connect Microsoft 365 first.',
      schema: microsoftMailJsonSchema,
    },
  );
}

module.exports = {
  createMicrosoftMailTool,
};
