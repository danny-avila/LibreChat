const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  buildGoogleDriveFullTextQuery,
  searchGoogleDriveFiles,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const googleDriveJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Optional search query to find files in the connected Google Drive account. Leave empty to list recently modified files.',
    },
    page_size: {
      type: 'number',
      description: 'Maximum number of files to return (1-20). Defaults to 10.',
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
async function createGoogleDriveTool({ user }) {
  return tool(
    async ({ query, page_size = 10 }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Google Drive integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'google-drive');
        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const driveQuery = query?.trim() ? buildGoogleDriveFullTextQuery(query) : undefined;
        const result = await searchGoogleDriveFiles(token.accessToken, {
          query: driveQuery,
          pageSize,
        });

        return JSON.stringify({
          files: result.files,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Google Drive search failed';
        logger.error('[google_drive] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.google_drive,
      description:
        'Search and list files in the connected user Google Drive account. Returns file names, IDs, MIME types, modification times, and web links. The user must connect Google Drive first.',
      schema: googleDriveJsonSchema,
    },
  );
}

module.exports = {
  createGoogleDriveTool,
};
