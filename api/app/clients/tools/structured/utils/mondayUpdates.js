// GraphQL запросы и мутации для работы с Updates (комментарии/обновления) monday.com API
module.exports = {
  // Создание обновления/комментария
  CREATE_UPDATE: `
    mutation createUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
        body
        text_body
        created_at
        updated_at
        creator {
          id
          name
          email
        }
        assets {
          id
          name
          url
          file_extension
        }
        replies {
          id
          body
          created_at
          creator {
            id
            name
          }
        }
      }
    }
  `,

  // Получение всех обновлений для элемента
  GET_UPDATES: `
    query getUpdates($itemId: ID!, $limit: Int, $page: Int) {
      items(ids: [$itemId]) {
        updates(limit: $limit, page: $page) {
          id
          body
          text_body
          created_at
          updated_at
          creator {
            id
            name
            email
          }
          assets {
            id
            name
            url
            file_extension
            file_size
          }
          replies {
            id
            body
            text_body
            created_at
            creator {
              id
              name
              email
            }
          }
        }
      }
    }
  `,

  // Получение обновлений для доски
  GET_BOARD_UPDATES: `
    query getBoardUpdates($boardId: ID!, $limit: Int, $page: Int) {
      boards(ids: [$boardId]) {
        updates(limit: $limit, page: $page) {
          id
          body
          text_body
          created_at
          item_id
          creator {
            id
            name
            email
          }
          assets {
            id
            name
            url
          }
        }
      }
    }
  `,

  // Ответ на обновление (используем create_update с parent_id)
  CREATE_UPDATE_REPLY: `
    mutation createUpdateReply($updateId: ID!, $body: String!) {
      create_update(parent_id: $updateId, body: $body) {
        id
        body
        text_body
        created_at
        creator {
          id
          name
          email
        }
      }
    }
  `,

  // Удаление обновления
  DELETE_UPDATE: `
    mutation deleteUpdate($id: ID!) {
      delete_update(id: $id) {
        id
      }
    }
  `,

  // Лайк обновления
  LIKE_UPDATE: `
    mutation likeUpdate($updateId: ID!) {
      like_update(update_id: $updateId) {
        id
      }
    }
  `,

  // Удаление лайка
  UNLIKE_UPDATE: `
    mutation unlikeUpdate($updateId: ID!) {
      unlike_update(update_id: $updateId) {
        id
      }
    }
  `,

  // Получение уведомлений для пользователя (через me query)
  GET_USER_NOTIFICATIONS: `
    query getUserNotifications {
      me {
        id
        name
        # Примечание: Уведомления доступны только через интерфейс monday.com
        # API не предоставляет прямого доступа к уведомлениям пользователя
      }
    }
  `,

  // Создание уведомления (единственная доступная функция для notifications)
  CREATE_NOTIFICATION: `
    mutation createNotification($userId: ID!, $targetId: ID!, $text: String!, $targetType: NotificationTargetType!) {
      create_notification(
        user_id: $userId,
        target_id: $targetId,
        text: $text,
        target_type: $targetType
      ) {
        text
      }
    }
  `
};
