// GraphQL запросы и мутации для работы с пользователями monday.com API v2
module.exports = {
  // Получение пользователей (базовая)
  GET_USERS: `
    query getUsers($limit: Int, $kind: UserKind) {
      users(limit: $limit, kind: $kind) {
        id
        name
        email
        created_at
        is_admin
        enabled
        account {
          name
          id
        }
        teams {
          id
          name
        }
      }
    }
  `,

  // Получение расширенной информации о пользователях
  GET_USERS_EXTENDED: `
    query getUsersExtended($limit: Int, $kind: UserKind, $ids: [ID!], $emails: [String]) {
      users(limit: $limit, kind: $kind, ids: $ids, emails: $emails) {
        id
        name
        email
        created_at
        is_admin
        is_guest
        is_pending
        is_view_only
        is_verified
        enabled
        phone
        mobile_phone
        title
        location
        birthday
        last_activity
        join_date
        time_zone_identifier
        utc_hours_diff
        current_language
        country_code
        photo_original
        photo_small
        photo_thumb
        photo_thumb_small
        photo_tiny
        url
        account {
          name
          id
        }
        teams {
          id
          name
          picture_url
        }
        out_of_office {
          active
          disable_notifications
          start_date
          end_date
          type
        }
        custom_field_values {
          custom_field_meta_id
          value
        }
      }
    }
  `,

  // Приглашение пользователей
  INVITE_USER: `
    mutation inviteUsers($emails: [String!]!, $userRole: UserRole, $product: Product) {
      invite_users(
        emails: $emails,
        user_role: $userRole,
        product: $product
      ) {
        invited_users {
          id
          name
          email
        }
        errors {
          message
          code
          email
        }
      }
    }
  `,

  // Обновление пользователей
  UPDATE_USER: `
    mutation updateUser($userUpdates: [UserUpdateInput!]!) {
      update_multiple_users(user_updates: $userUpdates) {
        updated_users {
          id
          name
          email
          birthday
          title
          location
          phone
          mobile_phone
        }
        errors {
          message
          code
          user_id
        }
      }
    }
  `,

  // Деактивация пользователей
  DEACTIVATE_USER: `
    mutation deactivateUsers($userIds: [ID!]!) {
      deactivate_users(user_ids: $userIds) {
        deactivated_users {
          id
          name
          email
        }
        errors {
          message
          code
          user_id
        }
      }
    }
  `,

  // Активация пользователей
  ACTIVATE_USER: `
    mutation activateUsers($userIds: [ID!]!) {
      activate_users(user_ids: $userIds) {
        activated_users {
          id
          name
          email
        }
        errors {
          message
          code
          user_id
        }
      }
    }
  `,

  // Обновление роли пользователей
  UPDATE_USER_ROLE: `
    mutation updateUserRole($userIds: [ID!]!, $newRole: BaseRoleName, $roleId: ID) {
      update_users_role(
        user_ids: $userIds,
        new_role: $newRole,
        role_id: $roleId
      ) {
        updated_users {
          id
          name
          email
          is_admin
        }
        errors {
          message
          code
          user_id
        }
      }
    }
  `,

  // Обновление домена электронной почты
  UPDATE_EMAIL_DOMAIN: `
    mutation updateEmailDomain($input: UpdateEmailDomainAttributesInput!) {
      update_email_domain(input: $input) {
        updated_users {
          id
          name
          email
          is_admin
        }
        errors {
          message
          code
          user_id
        }
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
        country_code
        first_day_of_the_week
        active_members_count
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
        sign_up_product_kind
      }
    }
  `,

  // Добавление пользователей к доске
  ADD_USERS_TO_BOARD: `
    mutation addUsersToBoard($boardId: ID!, $userIds: [ID!]!, $kind: BoardSubscriberKind) {
      add_users_to_board(
        board_id: $boardId,
        user_ids: $userIds,
        kind: $kind
      ) {
        id
        name
        email
      }
    }
  `,

  // Удаление пользователей с доски
  DELETE_SUBSCRIBERS_FROM_BOARD: `
    mutation deleteSubscribersFromBoard($boardId: ID!, $userIds: [ID!]!) {
      delete_subscribers_from_board(
        board_id: $boardId,
        user_ids: $userIds
      ) {
        id
        name
        email
      }
    }
  `
};
