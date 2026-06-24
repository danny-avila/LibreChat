const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  searchClioDocuments,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const clioJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Optional search query for Clio documents. Leave empty to list recently updated documents.',
    },
    page_size: {
      type: 'number',
      description: 'Maximum number of documents to return (1-20). Defaults to 10.',
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
async function createClioTool({ user }) {
  return tool(
    async ({ query, page_size = 10 }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Clio integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'clio');
        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const result = await searchClioDocuments(token.accessToken, {
          query,
          pageSize,
        });

        return JSON.stringify({
          files: result.files,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Clio document search failed';
        logger.error('[clio] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.clio,
      description:
        'Search and list documents in the connected user Clio account (read-only). Returns document names, types, and modification times. The user must connect Clio first.',
      schema: clioJsonSchema,
    },
  );
}

module.exports = {
  createClioTool,
};
