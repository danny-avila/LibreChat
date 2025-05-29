// GraphQL запросы для monday.com API
module.exports = {
  GET_BOARDS: `
    query getBoards($limit: Int!, $page: Int!, $workspaceIds: [ID]) {
      boards(limit: $limit, page: $page, workspace_ids: $workspaceIds) {
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
        }
        columns {
          id
          title
          type
          settings_str
        }
        items_count
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
        }
        columns @include(if: $includeColumns) {
          id
          title
          type
          settings_str
        }
        items_count
        items_page(limit: 10) @include(if: $includeItems) {
          cursor
          items {
            id
            name
            state
            group {
              id
              title
            }
          }
        }
      }
    }
  `,
  
  GET_ITEMS: `
    query getItems($boardId: [ID!]!, $limit: Int!, $columnValues: Boolean!) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
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
          }
        }
      }
    }
  `,
  
  SEARCH_ITEMS: `
    query searchItems($boardId: ID!, $query: String!) {
      items_page_by_column_values(
        limit: 25,
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
            text
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
      }
    }
  `,

  GET_USERS: `
    query getUsers($limit: Int!) {
      users(limit: $limit) {
        id
        name
        email
        created_at
        enabled
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
        }
      }
    }
  `
};
