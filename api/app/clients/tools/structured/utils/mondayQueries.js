// GraphQL queries for monday.com API
module.exports = {
  GET_BOARDS: `
    query getBoards($limit: Int!, $page: Int!, $workspaceIds: [ID], $boardKind: BoardKind) {
      boards(limit: $limit, page: $page, workspace_ids: $workspaceIds, board_kind: $boardKind) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
        groups {
          id
          title
          color
          position
        }
        columns {
          id
          title
          type
          settings_str
          description
        }
        items_count
        created_at
        updated_at
      }
    }
  `,
  
  GET_BOARD_DETAILS: `
    query getBoard($boardId: [ID!]!, $includeItems: Boolean!, $includeGroups: Boolean!, $includeColumns: Boolean!) {
      boards(ids: $boardId) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
        groups @include(if: $includeGroups) {
          id
          title
          color
          position
          items_count
        }
        columns @include(if: $includeColumns) {
          id
          title
          type
          settings_str
          description
          width
          position
        }
        items_count
        items_page(limit: 10) @include(if: $includeItems) {
          cursor
          items {
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
          }
        }
      }
    }
  `,
  
  GET_ITEMS: `
    query getItems($boardId: [ID!]!, $limit: Int!, $columnValues: Boolean!, $groupId: String) {
      boards(ids: $boardId) {
        items_page(limit: $limit, group_id: $groupId) {
          cursor
          items {
            id
            name
            state
            created_at
            updated_at
            group {
              id
              title
            }
            column_values @include(if: $columnValues) {
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
      }
    }
  `,
  
  SEARCH_ITEMS: `
    query searchItems($boardId: ID!, $query: String!, $limit: Int!) {
      items_page_by_column_values(
        limit: $limit,
        board_id: $boardId,
        columns: [
          {
            column_id: "name",
            column_values: [$query]
          }
        ]
      ) {
        cursor
        items {
          id
          name
          state
          created_at
          updated_at
          board {
            id
            name
          }
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
        }
      }
    }
  `,

  GET_WORKSPACES: `
    query getWorkspaces($limit: Int!) {
      workspaces(limit: $limit) {
        id
        name
        description
        created_at
        state
        picture_url
        items_count
        boards_count
        users_count
      }
    }
  `,

  GET_COLUMNS_INFO: `
    query getColumnsInfo($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns {
          id
          title
          type
          settings_str
          description
          width
          position
          archived
        }
      }
    }
  `
};
