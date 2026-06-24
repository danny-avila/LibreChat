const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  createOneDriveDocument,
  searchMicrosoftOneDriveFiles,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const microsoftOneDriveJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['search', 'create_document'],
      description:
        'Use "search" to list or find files. Use "create_document" to save a new document file in OneDrive from a title and body text.',
    },
    query: {
      type: 'string',
      description:
        'For search: optional query to find files. Leave empty to list recently modified files.',
    },
    page_size: {
      type: 'number',
      description: 'For search: maximum files to return (1-20). Defaults to 10.',
    },
    title: {
      type: 'string',
      description: 'For create_document: document title shown in OneDrive.',
    },
    content: {
      type: 'string',
      description: 'For create_document: plain-text body written into the new file.',
    },
    folder_id: {
      type: 'string',
      description: 'For create_document: optional parent folder ID in OneDrive.',
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
async function createMicrosoftOneDriveTool({ user }) {
  return tool(
    async ({ action = 'search', query, page_size = 10, title, content, folder_id }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Microsoft 365 integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'microsoft');

        if (action === 'create_document') {
          const document = await createOneDriveDocument(token.accessToken, {
            title: title ?? 'Untitled document',
            content: content ?? '',
            folderId: folder_id,
          });

          return JSON.stringify({
            document,
            message: 'OneDrive document created successfully.',
          });
        }

        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const result = await searchMicrosoftOneDriveFiles(token.accessToken, {
          query,
          pageSize,
        });

        return JSON.stringify({
          files: result.files,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Microsoft OneDrive tool failed';
        logger.error('[microsoft_onedrive] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.microsoft_onedrive,
      description:
        'Search, list, or create files in the connected user Microsoft OneDrive account. Use action create_document with title and content when the user asks to write or save a document to OneDrive. The user must connect Microsoft 365 first.',
      schema: microsoftOneDriveJsonSchema,
    },
  );
}

module.exports = {
  createMicrosoftOneDriveTool,
};
