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
        url
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
        url
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
      }
    }
  `,

  // Получение истории webhook'ов
  GET_WEBHOOK_LOGS: `
    query getWebhookLogs($webhookId: ID!, $limit: Int) {
      webhook_logs(webhook_id: $webhookId, limit: $limit) {
        id
        webhook_id
        request_body
        response_status_code
        created_at
        event_type
      }
    }
  `,

  // Тестирование webhook
  TEST_WEBHOOK: `
    mutation testWebhook($webhookId: ID!) {
      test_webhook(webhook_id: $webhookId) {
        id
        status
        response
      }
    }
  `
};
