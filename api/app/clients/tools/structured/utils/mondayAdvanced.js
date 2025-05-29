// GraphQL запросы и мутации для расширенной работы с Columns и Groups monday.com API
module.exports = {
  // Создание колонки
  CREATE_COLUMN: `
    mutation createColumn($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column(
        board_id: $boardId,
        title: $title,
        column_type: $columnType,
        defaults: $defaults
      ) {
        id
        title
        type
        settings_str
        description
      }
    }
  `,

  // Обновление колонки
  UPDATE_COLUMN: `
    mutation updateColumn($boardId: ID!, $columnId: String!, $title: String, $description: String) {
      change_column_title(
        board_id: $boardId,
        column_id: $columnId,
        title: $title
      ) {
        id
        title
        description
      }
    }
  `,

  // Удаление колонки
  DELETE_COLUMN: `
    mutation deleteColumn($boardId: ID!, $columnId: String!) {
      delete_column(board_id: $boardId, column_id: $columnId) {
        id
      }
    }
  `,

  // Дублирование колонки
  DUPLICATE_COLUMN: `
    mutation duplicateColumn($boardId: ID!, $columnId: String!, $title: String) {
      duplicate_column(
        board_id: $boardId,
        column_id: $columnId,
        title: $title
      ) {
        id
        title
        type
        settings_str
      }
    }
  `,

  // Перемещение колонки
  MOVE_COLUMN: `
    mutation moveColumn($boardId: ID!, $columnId: String!, $afterColumnId: String) {
      move_column_to(
        board_id: $boardId,
        column_id: $columnId,
        after_column_id: $afterColumnId
      ) {
        id
        title
      }
    }
  `,

  // Создание группы с настройками
  CREATE_GROUP_ADVANCED: `
    mutation createGroupAdvanced($boardId: ID!, $groupName: String!, $color: String, $position: String) {
      create_group(
        board_id: $boardId,
        group_name: $groupName,
        group_color: $color,
        position_relative_method: $position
      ) {
        id
        title
        color
        position
        archived
      }
    }
  `,

  // Обновление группы
  UPDATE_GROUP: `
    mutation updateGroup($boardId: ID!, $groupId: String!, $groupName: String, $color: String) {
      update_group(
        board_id: $boardId,
        group_id: $groupId,
        group_name: $groupName,
        group_color: $color
      ) {
        id
        title
        color
      }
    }
  `,

  // Удаление группы
  DELETE_GROUP: `
    mutation deleteGroup($boardId: ID!, $groupId: String!) {
      delete_group(board_id: $boardId, group_id: $groupId) {
        id
        deleted
      }
    }
  `,

  // Дублирование группы
  DUPLICATE_GROUP: `
    mutation duplicateGroup($boardId: ID!, $groupId: String!, $groupName: String, $addToTop: Boolean) {
      duplicate_group(
        board_id: $boardId,
        group_id: $groupId,
        group_title: $groupName,
        add_to_top: $addToTop
      ) {
        id
        title
        color
      }
    }
  `,

  // Архивирование группы
  ARCHIVE_GROUP: `
    mutation archiveGroup($boardId: ID!, $groupId: String!) {
      archive_group(board_id: $boardId, group_id: $groupId) {
        id
        archived
      }
    }
  `,

  // Перемещение группы
  MOVE_GROUP: `
    mutation moveGroup($boardId: ID!, $groupId: String!, $afterGroupId: String) {
      move_group_to(
        board_id: $boardId,
        group_id: $groupId,
        after_group_id: $afterGroupId
      ) {
        id
        title
        position
      }
    }
  `,

  // Перемещение элемента в группу
  MOVE_ITEM_TO_GROUP: `
    mutation moveItemToGroup($itemId: ID!, $groupId: String!) {
      move_item_to_group(item_id: $itemId, group_id: $groupId) {
        id
        name
        group {
          id
          title
        }
      }
    }
  `,

  // Получение расширенной информации о группах
  GET_GROUPS_EXTENDED: `
    query getGroupsExtended($boardId: [ID!]!) {
      boards(ids: $boardId) {
        groups {
          id
          title
          color
          position
          archived
          deleted
          items_page(limit: 10) {
            cursor
            items {
              id
              name
              state
              created_at
              updated_at
            }
          }
        }
      }
    }
  `,

  // Получение настроек колонки
  GET_COLUMN_SETTINGS: `
    query getColumnSettings($boardId: [ID!]!, $columnId: String!) {
      boards(ids: $boardId) {
        columns(ids: [$columnId]) {
          id
          title
          type
          settings_str
          description
          width
          archived
        }
      }
    }
  `,

  // Изменение настроек колонки
  CHANGE_COLUMN_METADATA: `
    mutation changeColumnMetadata($boardId: ID!, $columnId: String!, $columnProperty: ColumnProperty!, $value: String!) {
      change_column_metadata(
        board_id: $boardId,
        column_id: $columnId,
        column_property: $columnProperty,
        value: $value
      ) {
        id
        title
        settings_str
      }
    }
  `
};
