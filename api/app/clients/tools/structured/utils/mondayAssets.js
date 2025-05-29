// GraphQL запросы и мутации для работы с Assets и Files monday.com API
module.exports = {
  // Загрузка файла
  ADD_FILE_TO_UPDATE: `
    mutation addFileToUpdate($updateId: ID!, $file: File!) {
      add_file_to_update(update_id: $updateId, file: $file) {
        id
        name
        url
        file_extension
        file_size
        created_at
      }
    }
  `,

  // Загрузка файла к элементу
  ADD_FILE_TO_COLUMN: `
    mutation addFileToColumn($itemId: ID!, $columnId: String!, $file: File!) {
      add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) {
        id
        name
        url
        file_extension
        file_size
      }
    }
  `,

  // Получение assets для обновления
  GET_UPDATE_ASSETS: `
    query getUpdateAssets($updateId: ID!) {
      updates(ids: [$updateId]) {
        assets {
          id
          name
          url
          file_extension
          file_size
          created_at
          original_geometry
          public_url
        }
      }
    }
  `,

  // Получение assets для элемента
  GET_ITEM_ASSETS: `
    query getItemAssets($itemId: ID!) {
      items(ids: [$itemId]) {
        assets {
          id
          name
          url
          file_extension
          file_size
          created_at
          public_url
        }
        column_values {
          ... on FileValue {
            files {
              id
              name
              url
              file_size
              created_at
            }
          }
        }
      }
    }
  `,

  // Получение assets для обновления или элемента (delete_asset не существует в API)
  GET_ASSETS: `
    query getAssets($ids: [ID!]!) {
      assets(ids: $ids) {
        id
        name
        url
        file_extension
        file_size
        created_at
        uploaded_by {
          id
          name
        }
        public_url
        original_geometry
      }
    }
  `,

  // Получение всех assets через items/updates (workspace assets не поддерживается напрямую)
  GET_BOARD_ASSETS: `
    query getBoardAssets($boardId: [ID!]!, $limit: Int) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          items {
            assets {
              id
              name
              url
              file_extension
              file_size
              created_at
              uploaded_by {
                id
                name
              }
            }
          }
        }
      }
    }
  `,

  // Получение публичного URL (используется через поле public_url)
  GET_ASSET_PUBLIC_URL: `
    query getAssetPublicUrl($assetId: [ID!]!) {
      assets(ids: $assetId) {
        id
        name
        public_url
        url
      }
    }
  `,

  // Поиск assets через items (прямой поиск assets не поддерживается)
  SEARCH_BOARD_ASSETS: `
    query searchBoardAssets($boardId: [ID!]!, $limit: Int) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          items {
            name
            assets {
              id
              name
              url
              file_extension
              file_size
              created_at
              uploaded_by {
                id
                name
              }
            }
          }
        }
      }
    }
  `,

  // Получение thumbnail через url_thumbnail поле
  GET_ASSET_THUMBNAIL: `
    query getAssetThumbnail($assetId: [ID!]!) {
      assets(ids: $assetId) {
        id
        name
        url
        url_thumbnail
        original_geometry
      }
    }
  `
};
