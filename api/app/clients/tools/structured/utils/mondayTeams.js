// GraphQL запросы и мутации для работы с Teams и Users monday.com API
module.exports = {
  // Создание команды
  CREATE_TEAM: `
    mutation createTeam($input: CreateTeamAttributesInput!, $options: CreateTeamOptionsInput) {
      create_team(input: $input, options: $options) {
        id
        name
        picture_url
        owners {
          id
          name
          email
        }
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
    query getTeams($ids: [ID!]) {
      teams(ids: $ids) {
        id
        name
        picture_url
        owners {
          id
          name
          email
          phone
        }
        users {
          id
          name
          email
          phone
          enabled
        }
      }
    }
  `,

  // Получение команды по ID
  GET_TEAM: `
    query getTeam($ids: [ID!]!) {
      teams(ids: $ids) {
        id
        name
        picture_url
        owners {
          id
          name
          email
          phone
          enabled
          title
          location
        }
        users {
          id
          name
          email
          phone
          enabled
          title
          location
        }
      }
    }
  `,

  // Добавление пользователя в команду
  ADD_USER_TO_TEAM: `
    mutation addUserToTeam($teamId: ID!, $userIds: [ID!]!) {
      add_users_to_team(team_id: $teamId, user_ids: $userIds) {
        successful_users {
          id
          name
          email
        }
        failed_users {
          id
          name
          email
        }
      }
    }
  `,

  // Удаление пользователя из команды
  REMOVE_USER_FROM_TEAM: `
    mutation removeUserFromTeam($teamId: ID!, $userIds: [ID!]!) {
      remove_users_from_team(team_id: $teamId, user_ids: $userIds) {
        successful_users {
          id
          name
          email
        }
        failed_users {
          id
          name
          email
        }
      }
    }
  `,

  // Удаление команды
  DELETE_TEAM: `
    mutation deleteTeam($teamId: ID!) {
      delete_team(team_id: $teamId) {
        id
        name
      }
    }
  `,

  // Получение расширенной информации о пользователях
  GET_USERS_EXTENDED: `
    query getUsersExtended($ids: [ID!], $emails: [String!], $kind: UserKind, $limit: Int, $page: Int) {
      users(ids: $ids, emails: $emails, kind: $kind, limit: $limit, page: $page) {
        id
        name
        email
        enabled
        phone
        title
        location
        photo_original
        photo_thumb
        photo_thumb_small
        is_admin
        is_guest
        is_pending
        created_at
        join_date
        birthday
        country_code
        time_zone_identifier
        teams {
          id
          name
          picture_url
        }
      }
    }
  `,

  // Приглашение пользователей
  INVITE_USER: `
    mutation inviteUsers($emails: [String!]!, $kind: UserKind!, $teamIds: [ID]) {
      invite_users_to_account(emails: $emails, kind: $kind, team_ids: $teamIds) {
        id
        name
        email
        enabled
      }
    }
  `,

  // Обновление пользователей
  UPDATE_USER: `
    mutation updateUsers($userIds: [ID!]!, $name: String, $title: String, $phone: String, $location: String) {
      update_multiple_users(
        user_ids: $userIds,
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
        email
      }
    }
  `,

  // Деактивация пользователей
  DEACTIVATE_USER: `
    mutation deactivateUsers($userIds: [ID!]!) {
      deactivate_users(user_ids: $userIds) {
        id
        name
        email
        enabled
      }
    }
  `,

  // Получение информации об аккаунте
  GET_ACCOUNT: `
    query getAccount {
      account {
        id
        name
        logo
        show_timeline_weekends
        slug
        tier
        plan {
          max_users
          period
          tier
          version
        }
        users {
          id
          name
          email
          kind
        }
      }
    }
  `
};
