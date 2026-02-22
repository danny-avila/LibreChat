export enum CONSTANTS {
  /** System user ID for app-level OAuth tokens (all zeros ObjectId) */
  SYSTEM_USER_ID = '000000000000000000000000',
}

export function isSystemUserId(userId?: string): boolean {
  return userId === CONSTANTS.SYSTEM_USER_ID;
}
