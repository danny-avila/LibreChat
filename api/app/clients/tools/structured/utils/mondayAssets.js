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

  // Удаление asset
  DELETE_ASSET: `
    mutation deleteAsset($assetId: ID!) {
      delete_asset(asset_id: $assetId) {
        id
      }
    }
  `,

  // Получение всех assets workspace
  GET_WORKSPACE_ASSETS: `
    query getWorkspaceAssets($workspaceId: ID!, $limit: Int, $page: Int) {
      assets(workspace_id: $workspaceId, limit: $limit, page: $page) {
        id
        name
        url
        file_extension
        file_size
        created_at
        created_by {
          id
          name
        }
        public_url
        original_geometry
      }
    }
  `,

  // Создание публичной ссылки на файл
  CREATE_ASSET_PUBLIC_URL: `
    mutation createAssetPublicUrl($assetId: ID!) {
      create_asset_public_url(asset_id: $assetId) {
        public_url
        expires_at
      }
    }
  `,

  // Поиск assets по имени
  SEARCH_ASSETS: `
    query searchAssets($query: String!, $workspaceId: ID, $limit: Int) {
      assets(
        query: $query,
        workspace_id: $workspaceId,
        limit: $limit
      ) {
        id
        name
        url
        file_extension
        file_size
        created_at
        created_by {
          id
          name
        }
      }
    }
  `,

  // Получение превью изображения
  GET_ASSET_THUMBNAIL: `
    query getAssetThumbnail($assetId: ID!, $width: Int, $height: Int) {
      assets(ids: [$assetId]) {
        id
        name
        thumbnail(width: $width, height: $height) {
          url
          width
          height
        }
      }
    }
  `
};
