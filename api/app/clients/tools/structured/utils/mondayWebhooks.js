// GraphQL запросы и мутации для работы с Webhooks monday.com API
module.exports = {
  // Создание webhook
  CREATE_WEBHOOK: `
    mutation createWebhook($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON) {
      create_webhook(
        board_id: $boardId,
        url: $url,
        event: $event,
        config: $config
      ) {
        id
        board_id
        event
        config
      }
    }
  `,

  // Получение всех webhooks для доски
  GET_WEBHOOKS: `
    query getWebhooks($boardId: ID!) {
      webhooks(board_id: $boardId) {
        id
        board_id
        event
        config
      }
    }
  `,

  // Удаление webhook
  DELETE_WEBHOOK: `
    mutation deleteWebhook($id: ID!) {
      delete_webhook(id: $id) {
        id
        board_id
      }
    }
  `
};
