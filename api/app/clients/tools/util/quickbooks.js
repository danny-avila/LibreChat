const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  extractQuickBooksRealmId,
  getNangoClient,
  isNangoConfigured,
  runQuickBooksAction,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const quickbooksJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list_invoices', 'list_customers', 'list_payments', 'list_expenses'],
      description:
        'QuickBooks read action: list_invoices (outstanding invoices), list_customers, list_payments, or list_expenses.',
    },
    max_results: {
      type: 'number',
      description: 'Maximum records to return (1-50). Defaults to 10.',
    },
    open_only: {
      type: 'boolean',
      description:
        'For list_invoices only: when true, return invoices with an outstanding balance.',
    },
  },
  required: ['action'],
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
async function createQuickBooksTool({ user }) {
  return tool(
    async ({ action, max_results = 10, open_only = false }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'QuickBooks integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'quickbooks');
        const userId = user._id?.toString() ?? user.id ?? '';
        const connection = await db.findNangoConnectionByUserAndProvider(userId, 'quickbooks');

        if (!connection?.connectionId) {
          return JSON.stringify({ error: 'QuickBooks is not connected for this user.' });
        }

        const nango = getNangoClient();
        const nangoConnection = await nango.getConnection('quickbooks', connection.connectionId);
        const realmId = extractQuickBooksRealmId(nangoConnection);

        if (!realmId) {
          return JSON.stringify({
            error: 'QuickBooks company (realm) ID is missing. Reconnect QuickBooks and try again.',
          });
        }

        const maxResults = Math.min(Math.max(Number(max_results) || 10, 1), 50);
        const result = await runQuickBooksAction(
          { accessToken: token.accessToken, realmId },
          action,
          {
            maxResults,
            openOnly: action === 'list_invoices' ? Boolean(open_only) : false,
          },
        );

        return JSON.stringify({ action, records: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'QuickBooks request failed';
        logger.error('[quickbooks] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.quickbooks,
      description:
        'Read data from the connected user QuickBooks Online company: invoices, customers, payments, and expenses. The user must connect QuickBooks first.',
      schema: quickbooksJsonSchema,
    },
  );
}

module.exports = {
  createQuickBooksTool,
};
