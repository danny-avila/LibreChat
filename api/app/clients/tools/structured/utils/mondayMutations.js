// GraphQL mutations for monday.com API
module.exports = {
  CREATE_BOARD: `
    mutation createBoard($boardName: String!, $boardKind: BoardKind!, $workspaceId: ID, $templateId: ID) {
      create_board(
        board_name: $boardName,
        board_kind: $boardKind,
        workspace_id: $workspaceId,
        template_id: $templateId
      ) {
        id
        name
        board_kind
        workspace {
          id
          name
        }
        state
        created_at
      }
    }
  `,

  CREATE_ITEM: `
    mutation createItem($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON, $createLabelsIfMissing: Boolean) {
      create_item(
        board_id: $boardId,
        item_name: $itemName,
        group_id: $groupId,
        column_values: $columnValues,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        state
        created_at
        updated_at
        group {
          id
          title
        }
        column_values {
          id
          title
          type
          text
          value
        }
        board {
          id
          name
        }
      }
    }
  `,
  
  UPDATE_ITEM: `
    mutation updateItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!, $createLabelsIfMissing: Boolean) {
      change_multiple_column_values(
        board_id: $boardId,
        item_id: $itemId,
        column_values: $columnValues,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        state
        updated_at
        column_values {
          id
          title
          type
          text
          value
        }
      }
    }
  `,

  DELETE_ITEM: `
    mutation deleteItem($itemId: ID!) {
      delete_item(item_id: $itemId) {
        id
        state
        deleted_at
      }
    }
  `,
  
  UPDATE_COLUMN_VALUE: `
    mutation updateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!, $createLabelsIfMissing: Boolean) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value,
        create_labels_if_missing: $createLabelsIfMissing
      ) {
        id
        name
        state
        updated_at
        column_values {
          id
          title
          type
          text
          value
        }
      }
    }
  `,
  
  CREATE_GROUP: `
    mutation createGroup($boardId: ID!, $groupName: String!, $color: String, $position: String) {
      create_group(
        board_id: $boardId,
        group_name: $groupName,
        color: $color,
        position: $position
      ) {
        id
        title
        color
        position
        items_count
      }
    }
  `,

  ADD_COMMENT: `
    mutation addComment($itemId: ID!, $body: String!, $parentId: ID) {
      create_update(
        item_id: $itemId,
        body: $body,
        parent_id: $parentId
      ) {
        id
        body
        created_at
        updated_at
        creator {
          id
          name
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
  `
};
