const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  listOutlookCalendarEvents,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const microsoftCalendarJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Optional free-text search for calendar events. Leave empty to list upcoming events.',
    },
    page_size: {
      type: 'number',
      description: 'Maximum number of events to return (1-20). Defaults to 10.',
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
async function createMicrosoftCalendarTool({ user }) {
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
        const now = new Date();
        const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        const result = await listOutlookCalendarEvents(token.accessToken, {
          query,
          pageSize,
          timeMin: now.toISOString(),
          timeMax: timeMax.toISOString(),
        });

        return JSON.stringify({
          events: result.events,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Outlook calendar search failed';
        logger.error('[microsoft_calendar] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.microsoft_calendar,
      description:
        'Search and list upcoming events in the connected user Outlook Calendar. Returns titles, times, locations, and links. The user must connect Microsoft 365 first.',
      schema: microsoftCalendarJsonSchema,
    },
  );
}

module.exports = {
  createMicrosoftCalendarTool,
};
