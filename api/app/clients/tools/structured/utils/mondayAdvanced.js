// GraphQL запросы и мутации для расширенной работы с Columns и Groups monday.com API
module.exports = {
  // Создание колонки
  CREATE_COLUMN: `
    mutation createColumn($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON, $description: String, $id: String, $afterColumnId: ID) {
      create_column(
        board_id: $boardId,
        title: $title,
        column_type: $columnType,
        defaults: $defaults,
        description: $description,
        id: $id,
        after_column_id: $afterColumnId
      ) {
        id
        title
        type
        settings_str
        description
        width
      }
    }
  `,

  // Обновление заголовка колонки
  UPDATE_COLUMN_TITLE: `
    mutation updateColumnTitle($boardId: ID!, $columnId: String!, $title: String!) {
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

  // Изменение значения колонки
  CHANGE_COLUMN_VALUE: `
    mutation changeColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!, $createLabelsIfMissing: Boolean) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        column_values {
          id
          value
          text
        }
      }
    }
  `,

  // Изменение простого значения колонки
  CHANGE_SIMPLE_COLUMN_VALUE: `
    mutation changeSimpleColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String, $createLabelsIfMissing: Boolean) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        column_values {
          id
          value
          text
        }
      }
    }
  `,

  // Изменение нескольких значений колонок
  CHANGE_MULTIPLE_COLUMN_VALUES: `
    mutation changeMultipleColumnValues($boardId: ID!, $itemId: ID!, $columnValues: JSON!, $createLabelsIfMissing: Boolean) {
      change_multiple_column_values(
        board_id: $boardId,
        item_id: $itemId,
        column_values: $columnValues,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        column_values {
          id
          value
          text
        }
      }
    }
  `,

  // Создание группы с настройками
  CREATE_GROUP_ADVANCED: `
    mutation createGroupAdvanced($boardId: ID!, $groupName: String!, $groupColor: String, $relativeTo: String, $positionRelativeMethod: PositionRelative) {
      create_group(
        board_id: $boardId,
        group_name: $groupName,
        group_color: $groupColor,
        relative_to: $relativeTo,
        position_relative_method: $positionRelativeMethod
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
    mutation updateGroup($boardId: ID!, $groupId: String!, $groupAttribute: GroupAttributes!, $newValue: String!) {
      update_group(
        board_id: $boardId,
        group_id: $groupId,
        group_attribute: $groupAttribute,
        new_value: $newValue
      ) {
        id
        title
        color
        position
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
    mutation duplicateGroup($boardId: ID!, $groupId: String!, $groupTitle: String, $addToTop: Boolean) {
      duplicate_group(
        board_id: $boardId,
        group_id: $groupId,
        group_title: $groupTitle,
        add_to_top: $addToTop
      ) {
        id
        title
        color
        position
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
    query getColumnSettings($boardId: [ID!]!, $columnIds: [String!]) {
      boards(ids: $boardId) {
        columns(ids: $columnIds) {
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

  // Изменение метаданных колонки
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
        description
        settings_str
      }
    }
  `
};
