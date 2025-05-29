// GraphQL запросы и мутации для работы с Workspaces и структурированием проектов monday.com API
module.exports = {
  // Создание workspace
  CREATE_WORKSPACE: `
    mutation createWorkspace($name: String!, $kind: WorkspaceKind!, $description: String) {
      create_workspace(name: $name, kind: $kind, description: $description) {
        id
        name
        kind
        description
        created_at
      }
    }
  `,

  // Получение расширенной информации о workspaces
  GET_WORKSPACES_EXTENDED: `
    query getWorkspacesExtended($limit: Int, $ids: [ID]) {
      workspaces(limit: $limit, ids: $ids) {
        id
        name
        kind
        description
        created_at
        state
        is_default_workspace
        settings {
          product_id
        }
        users_subscribers {
          id
          name
          email
          enabled
        }
        teams_subscribers {
          id
          name
        }
        account_product {
          id
          name
          kind
        }
      }
    }
  `,

  // Обновление workspace
  UPDATE_WORKSPACE: `
    mutation updateWorkspace($workspaceId: ID!, $attributes: WorkspaceAttributesInput!) {
      update_workspace(id: $workspaceId, attributes: $attributes) {
        id
        name
        description
        kind
        state
      }
    }
  `,

  // Удаление workspace
  DELETE_WORKSPACE: `
    mutation deleteWorkspace($workspaceId: ID!) {
      delete_workspace(id: $workspaceId) {
        id
      }
    }
  `,

  // Добавление пользователей к workspace
  ADD_USERS_TO_WORKSPACE: `
    mutation addUsersToWorkspace($workspaceId: ID!, $userIds: [ID!]!, $kind: WorkspaceSubscriberKind!) {
      add_users_to_workspace(
        workspace_id: $workspaceId,
        user_ids: $userIds,
        kind: $kind
      ) {
        id
        name
        email
      }
    }
  `,

  // Удаление пользователей из workspace
  REMOVE_USERS_FROM_WORKSPACE: `
    mutation removeUsersFromWorkspace($workspaceId: ID!, $userIds: [ID!]!) {
      delete_users_from_workspace(
        workspace_id: $workspaceId,
        user_ids: $userIds
      ) {
        id
        enabled
      }
    }
  `,

  // Получение папок workspace
  GET_FOLDERS: `
    query getFolders($workspaceId: ID!, $limit: Int) {
      folders(workspace_id: $workspaceId, limit: $limit) {
        id
        name
        color
        created_at
        parent_folder_id
        children {
          id
          name
        }
        owner {
          id
          name
        }
      }
    }
  `,

  // Создание папки
  CREATE_FOLDER: `
    mutation createFolder($name: String!, $workspaceId: ID!, $color: FolderColor, $parentFolderId: ID) {
      create_folder(
        name: $name,
        workspace_id: $workspaceId,
        color: $color,
        parent_folder_id: $parentFolderId
      ) {
        id
        name
        color
        created_at
        workspace {
          id
          name
        }
      }
    }
  `,

  // Обновление папки
  UPDATE_FOLDER: `
    mutation updateFolder($folderId: ID!, $name: String, $color: FolderColor) {
      update_folder(folder_id: $folderId, name: $name, color: $color) {
        id
        name
        color
      }
    }
  `,

  // Удаление папки
  DELETE_FOLDER: `
    mutation deleteFolder($folderId: ID!) {
      delete_folder(folder_id: $folderId) {
        id
      }
    }
  `,



  // Архивирование доски
  ARCHIVE_BOARD: `
    mutation archiveBoard($boardId: ID!) {
      archive_board(board_id: $boardId) {
        id
        state
      }
    }
  `,



  // Дублирование доски
  DUPLICATE_BOARD: `
    mutation duplicateBoard(
      $boardId: ID!,
      $duplicateType: DuplicateBoardType!,
      $boardName: String!,
      $workspaceId: ID,
      $folderId: ID,
      $keepSubscribers: Boolean
    ) {
      duplicate_board(
        board_id: $boardId,
        duplicate_type: $duplicateType,
        board_name: $boardName,
        workspace_id: $workspaceId,
        folder_id: $folderId,
        keep_subscribers: $keepSubscribers
      ) {
        board {
          id
          name
          state
        }
      }
    }
  `,



  // Создание доски из шаблона
  CREATE_BOARD_FROM_TEMPLATE: `
    mutation createBoardFromTemplate(
      $templateId: ID!,
      $boardName: String!,
      $workspaceId: ID,
      $folderId: ID
    ) {
      create_board_from_template(
        template_id: $templateId,
        board_name: $boardName,
        workspace_id: $workspaceId,
        folder_id: $folderId
      ) {
        id
        name
        workspace {
          id
          name
        }
      }
    }
  `
};
