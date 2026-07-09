const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  runClioAction,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const CLIO_ACTIONS = [
  'search_documents',
  'list_matters',
  'get_matter',
  'list_contacts',
  'get_contact',
  'list_tasks',
  'list_activities',
  'list_communications',
  'list_calendar_entries',
  'list_users',
  'get_user',
  'create_matter',
  'create_contact',
  'create_task',
  'create_activity_time_entry',
  'create_document',
];

const clioJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: CLIO_ACTIONS,
      description:
        'Clio action to perform. Read: search_documents, list_matters, get_matter, list_contacts, get_contact, list_tasks, list_activities, list_communications, list_calendar_entries, list_users, get_user. Write: create_matter, create_contact, create_task, create_activity_time_entry, create_document. Do not write communications or calendar entries.',
    },
    query: {
      type: 'string',
      description: 'Search query for search_documents, list_matters, list_contacts, or list_users.',
    },
    page_size: {
      type: 'number',
      description: 'For search_documents: max documents (1-20). Defaults to 10.',
    },
    max_results: {
      type: 'number',
      description: 'Maximum records to return for list actions (1-50). Defaults to 20.',
    },
    page_token: {
      type: 'string',
      description: 'Pagination token from a previous Clio list response.',
    },
    status: {
      type: 'string',
      description: 'For list_matters: filter by status (open, pending, closed).',
    },
    matter_id: {
      type: 'string',
      description: 'Matter id for get_matter or matter-scoped list/create actions.',
    },
    contact_id: {
      type: 'string',
      description: 'Contact id for get_contact.',
    },
    user_id: {
      type: 'string',
      description: 'User id for get_user.',
    },
    start_date: {
      type: 'string',
      description: 'For list_calendar_entries: start date (YYYY-MM-DD).',
    },
    end_date: {
      type: 'string',
      description: 'For list_calendar_entries: end date (YYYY-MM-DD).',
    },
    client_id: {
      type: 'string',
      description: 'For create_matter: existing Clio contact id of the client.',
    },
    description: {
      type: 'string',
      description:
        'For create_matter: matter title/description. For create_task: optional details.',
    },
    responsible_attorney_id: {
      type: 'string',
      description: 'For create_matter: optional Clio user id of the responsible attorney.',
    },
    name: {
      type: 'string',
      description: 'For create_contact, create_task, or create_document: record name.',
    },
    type: {
      type: 'string',
      description: 'For create_contact: Person or Company. Defaults to Person.',
    },
    first_name: {
      type: 'string',
      description: 'For create_contact (Person): optional first name.',
    },
    last_name: {
      type: 'string',
      description: 'For create_contact (Person): optional last name.',
    },
    assignee_id: {
      type: 'string',
      description: 'For create_task: required Clio user or contact id of the assignee.',
    },
    assignee_type: {
      type: 'string',
      enum: ['User', 'Contact'],
      description: 'For create_task: assignee type. Defaults to User.',
    },
    quantity_hours: {
      type: 'number',
      description: 'For create_activity_time_entry: billable hours (e.g. 0.5 for 30 minutes).',
    },
    date: {
      type: 'string',
      description: 'For create_activity_time_entry: entry date (YYYY-MM-DD). Defaults to today.',
    },
    note: {
      type: 'string',
      description: 'For create_activity_time_entry: optional time entry note.',
    },
    content: {
      type: 'string',
      description: 'For create_document: optional text body to upload.',
    },
    filename: {
      type: 'string',
      description: 'For create_document: optional file name (e.g. notes.txt).',
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
async function createClioTool({ user }) {
  return tool(
    async (input) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Clio integration is not configured on this server.',
        });
      }

      const { action, ...params } = input;

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'clio');
        const result = await runClioAction(token.accessToken, action, params);

        if (action === 'search_documents') {
          return JSON.stringify(result);
        }

        if (action.startsWith('create_')) {
          return JSON.stringify({ action, ...result });
        }

        if (action.startsWith('get_')) {
          return JSON.stringify({ action, record: result });
        }

        return JSON.stringify({ action, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Clio request failed';
        logger.error('[clio] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.clio,
      description:
        'Read and write data in the connected user Clio account: matters, contacts, tasks, activities, documents, communications (read only), calendar entries (read only), and users (read only). Write actions return the created record id. The user must connect Clio first; reconnect if permissions were recently expanded.',
      schema: clioJsonSchema,
    },
  );
}

module.exports = {
  createClioTool,
};
