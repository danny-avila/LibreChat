/**
 * Enum for Group Types
 */
export enum GroupType {
  /**
   * Type for local groups
   */
  LOCAL = 'local',
  /**
   * Type for groups synced from OpenID provider
   */
  OPENID = 'openid',
  /**
   * Type for groups synced from LDAP server
   */
  LDAP = 'ldap',
}
