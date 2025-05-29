// GraphQL запросы и мутации для работы с Teams и Users monday.com API
module.exports = {
  // Создание команды
  CREATE_TEAM: `
    mutation createTeam($name: String!, $description: String, $picture_url: String) {
      create_team(name: $name, description: $description, picture_url: $picture_url) {
        id
        name
        description
        picture_url
        created_at
        users {
          id
          name
          email
        }
      }
    }
  `,

  // Получение всех команд
  GET_TEAMS: `
    query getTeams($limit: Int, $page: Int) {
      teams(limit: $limit, page: $page) {
        id
        name
        description
        picture_url
        created_at
        users {
          id
          name
          email
          photo_original
          enabled
        }
      }
    }
  `,

  // Получение команды по ID
  GET_TEAM: `
    query getTeam($id: ID!) {
      teams(ids: [$id]) {
        id
        name
        description
        picture_url
        created_at
        users {
          id
          name
          email
          photo_original
          enabled
          created_at
          title
          phone
          location
        }
      }
    }
  `,

  // Добавление пользователя в команду
  ADD_USER_TO_TEAM: `
    mutation addUserToTeam($teamId: ID!, $userId: ID!) {
      add_users_to_team(team_id: $teamId, user_ids: [$userId]) {
        id
        name
        users {
          id
          name
          email
        }
      }
    }
  `,

  // Удаление пользователя из команды
  REMOVE_USER_FROM_TEAM: `
    mutation removeUserFromTeam($teamId: ID!, $userId: ID!) {
      remove_users_from_team(team_id: $teamId, user_ids: [$userId]) {
        id
        name
        users {
          id
          name
          email
        }
      }
    }
  `,

  // Обновление команды
  UPDATE_TEAM: `
    mutation updateTeam($teamId: ID!, $name: String, $description: String, $picture_url: String) {
      update_team(team_id: $teamId, name: $name, description: $description, picture_url: $picture_url) {
        id
        name
        description
        picture_url
      }
    }
  `,

  // Удаление команды
  DELETE_TEAM: `
    mutation deleteTeam($teamId: ID!) {
      delete_team(team_id: $teamId) {
        id
      }
    }
  `,

  // Получение расширенной информации о пользователях
  GET_USERS_EXTENDED: `
    query getUsersExtended($limit: Int, $page: Int, $emails: [String], $ids: [ID]) {
      users(limit: $limit, page: $page, emails: $emails, ids: $ids) {
        id
        name
        email
        photo_original
        photo_small
        enabled
        created_at
        title
        phone
        location
        time_zone_identifier
        is_guest
        is_pending
        is_admin
        is_verified
        teams {
          id
          name
        }
        account {
          id
          name
          logo
          show_timeline_weekends
          slug
        }
      }
    }
  `,

  // Приглашение пользователя
  INVITE_USER: `
    mutation inviteUser($email: String!, $kind: UserKind!, $teamIds: [ID]) {
      add_users_to_workspace(
        emails: [$email],
        kind: $kind,
        team_ids: $teamIds
      ) {
        id
        name
        email
        enabled
      }
    }
  `,

  // Обновление пользователя
  UPDATE_USER: `
    mutation updateUser($userId: ID!, $name: String, $title: String, $phone: String, $location: String) {
      update_user(
        user_id: $userId,
        name: $name,
        title: $title,
        phone: $phone,
        location: $location
      ) {
        id
        name
        title
        phone
        location
      }
    }
  `,

  // Деактивация пользователя
  DEACTIVATE_USER: `
    mutation deactivateUser($userId: ID!) {
      delete_users_from_workspace(user_ids: [$userId]) {
        id
        enabled
      }
    }
  `,

  // Получение аккаунта
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
          name
          kind
        }
        show_timeline_weekends
        slug
      }
    }
  `
};
