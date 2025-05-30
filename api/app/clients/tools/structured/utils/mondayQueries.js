// GraphQL queries for monday.com API
module.exports = {
  GET_BOARDS: `
    query getBoards($limit: Int!) {
      boards(limit: $limit) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
        items_count
      }
    }
  `,
  
  GET_BOARD_DETAILS: `
    query getBoard($boardId: [ID!]!) {
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
        columns {
          id
          title
          type
          settings_str
        }
        groups {
          id
          title
          color
        }
        items_count
      }
    }
  `,
  
  GET_ITEMS: `
    query getItems($ids: [ID!]!, $limit: Int!) {
      boards(ids: $ids) {
        items_page(limit: $limit) {
          items {
            id
            name
          }
        }
      }
    }
  `,
  
  SEARCH_ITEMS: `
    query searchItems($boardId: [ID!]!, $query: String!, $limit: Int!) {
      boards(ids: $boardId) {
        items_page(
          limit: $limit,
          query_params: {
            rules: [{
              column_id: "name", 
              compare_value: [$query], 
              operator: any_of
            }]
          }
        ) {
          items {
            id
            name
            group {
              id
              title
            }
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
        kind
        description
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
          archived
        }
      }
    }
  `,

  GET_USERS: `
    query getUsers($limit: Int!) {
      users(limit: $limit) {
        id
        name
        email
        enabled
        title
        phone
        location
      }
    }
  `,

  GET_ACCOUNT: `
    query getAccount {
      account {
        id
        name
        logo
        plan {
          max_users
          period
          tier
          version
        }
        products {
          id
          kind
        }
      }
    }
  `
};
