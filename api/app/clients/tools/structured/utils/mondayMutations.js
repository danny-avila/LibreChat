// GraphQL мутации для monday.com API
module.exports = {
  CREATE_BOARD: `
    mutation createBoard($boardName: String!, $boardKind: BoardKind!, $workspaceId: ID) {
      create_board(
        board_name: $boardName,
        board_kind: $boardKind,
        workspace_id: $workspaceId
      ) {
        id
        name
        board_kind
        workspace {
          id
          name
        }
      }
    }
  `,

  CREATE_ITEM: `
    mutation createItem($boardId: ID!, $itemName: String!, $groupId: String, $columnValues: JSON) {
      create_item(
        board_id: $boardId,
        item_name: $itemName,
        group_id: $groupId,
        column_values: $columnValues
      ) {
        id
        name
        group {
          id
          title
        }
        column_values {
          id
          title
          text
          value
        }
      }
    }
  `,
  
  UPDATE_ITEM: `
    mutation updateItem($itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        item_id: $itemId,
        board_id: 0,
        column_values: $columnValues
      ) {
        id
        name
        column_values {
          id
          title
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
      }
    }
  `,
  
  UPDATE_COLUMN_VALUE: `
    mutation updateColumn($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) {
        id
        name
      }
    }
  `,
  
  CREATE_GROUP: `
    mutation createGroup($boardId: ID!, $groupName: String!) {
      create_group(board_id: $boardId, group_name: $groupName) {
        id
        title
        color
      }
    }
  `,

  ADD_COMMENT: `
    mutation addComment($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
        body
        created_at
      }
    }
  `
};
