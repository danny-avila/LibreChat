const { logger } = require('@librechat/data-schemas');
const { tool } = require('@librechat/agents/langchain/tools');
const {
  createNangoService,
  getNangoClient,
  isNangoConfigured,
  createGmailDraft,
  getGmailMessageAsText,
  listGmailLabels,
  modifyGmailMessageLabels,
  searchGmailMessages,
  sendGmailMessage,
} = require('@librechat/api');
const { Tools } = require('librechat-data-provider');
const db = require('~/models');

const googleMailJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'search',
        'read_message',
        'create_draft',
        'send_message',
        'list_labels',
        'modify_labels',
      ],
      description:
        'Use "search" to find emails (default). "read_message" to read one full email by message_id. "create_draft" to save a draft without sending. "send_message" to send an email immediately. "list_labels" to list available labels. "modify_labels" to add/remove labels on a message.',
    },
    query: {
      type: 'string',
      description:
        'For search: optional Gmail search query (same syntax as Gmail search box). Leave empty to list recent messages.',
    },
    page_size: {
      type: 'number',
      description: 'For search: maximum number of messages to return (1-20). Defaults to 10.',
    },
    message_id: {
      type: 'string',
      description: 'For read_message and modify_labels: the Gmail message ID (from search results).',
    },
    to: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: recipient email addresses.',
    },
    cc: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: optional CC email addresses.',
    },
    bcc: {
      type: 'array',
      items: { type: 'string' },
      description: 'For create_draft/send_message: optional BCC email addresses.',
    },
    subject: {
      type: 'string',
      description: 'For create_draft/send_message: the email subject line.',
    },
    body: {
      type: 'string',
      description: 'For create_draft/send_message: the plain-text email body.',
    },
    reply_to_message_id: {
      type: 'string',
      description:
        'For create_draft/send_message: optional message ID to reply to; keeps the email in the same thread.',
    },
    add_label_ids: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For modify_labels: label IDs to add (system IDs like "STARRED", "IMPORTANT", or a user label ID from list_labels).',
    },
    remove_label_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'For modify_labels: label IDs to remove (e.g. "UNREAD", "INBOX").',
    },
  },
};

function toRecipientList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

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
async function createGoogleMailTool({ user }) {
  return tool(
    async ({
      action = 'search',
      query,
      page_size = 10,
      message_id,
      to,
      cc,
      bcc,
      subject,
      body,
      reply_to_message_id,
      add_label_ids,
      remove_label_ids,
    }) => {
      if (!isNangoConfigured()) {
        return JSON.stringify({
          error: 'Gmail integration is not configured on this server.',
        });
      }

      try {
        const nangoService = createNangoServiceInstance();
        const token = await nangoService.getProviderAccessToken(user, 'google-mail');

        if (action === 'read_message') {
          if (!message_id) {
            return JSON.stringify({ error: 'message_id is required to read a message.' });
          }
          const message = await getGmailMessageAsText(token.accessToken, message_id);
          return JSON.stringify({ message });
        }

        if (action === 'create_draft') {
          const draft = await createGmailDraft(token.accessToken, {
            to: toRecipientList(to),
            cc: toRecipientList(cc),
            bcc: toRecipientList(bcc),
            subject,
            body,
            replyToMessageId: reply_to_message_id,
          });
          return JSON.stringify({ draft, message: 'Gmail draft created successfully.' });
        }

        if (action === 'send_message') {
          const sent = await sendGmailMessage(token.accessToken, {
            to: toRecipientList(to),
            cc: toRecipientList(cc),
            bcc: toRecipientList(bcc),
            subject,
            body,
            replyToMessageId: reply_to_message_id,
          });
          return JSON.stringify({ sent, message: 'Email sent successfully.' });
        }

        if (action === 'list_labels') {
          const labels = await listGmailLabels(token.accessToken);
          return JSON.stringify({ labels });
        }

        if (action === 'modify_labels') {
          if (!message_id) {
            return JSON.stringify({ error: 'message_id is required to modify labels.' });
          }
          const result = await modifyGmailMessageLabels(token.accessToken, {
            messageId: message_id,
            addLabelIds: add_label_ids,
            removeLabelIds: remove_label_ids,
          });
          return JSON.stringify({ result, message: 'Labels updated successfully.' });
        }

        const pageSize = Math.min(Math.max(Number(page_size) || 10, 1), 20);
        const result = await searchGmailMessages(token.accessToken, {
          query,
          pageSize,
        });

        return JSON.stringify({
          messages: result.messages,
          nextPageToken: result.nextPageToken,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gmail request failed';
        logger.error('[google_mail] tool error:', error);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: Tools.google_mail,
      description:
        'Read and manage the connected user Gmail account: search emails, read a full message, create drafts, send messages, and add or remove labels. The user must connect Gmail first. Sending email is irreversible — confirm recipients and content with the user before using action send_message.',
      schema: googleMailJsonSchema,
    },
  );
}

module.exports = {
  createGoogleMailTool,
};
