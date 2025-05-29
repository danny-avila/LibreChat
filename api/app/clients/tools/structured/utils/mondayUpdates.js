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

  // Ответ на обновление
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

  // Получение уведомлений для пользователя
  GET_USER_NOTIFICATIONS: `
    query getUserNotifications($limit: Int, $page: Int) {
      notifications(limit: $limit, page: $page) {
        id
        text
        created_at
        read_at
        target_id
        target_type
      }
    }
  `,

  // Отметка уведомления как прочитанного
  MARK_NOTIFICATION_READ: `
    mutation markNotificationRead($id: ID!) {
      mark_notification_as_read(id: $id) {
        id
        read_at
      }
    }
  `,

  // Отметка всех уведомлений как прочитанных
  MARK_ALL_NOTIFICATIONS_READ: `
    mutation markAllNotificationsRead {
      mark_all_notifications_as_read {
        success
      }
    }
  `
};
