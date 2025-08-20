import { PermissionBits } from 'librechat-data-provider';

/**
 * Common role combinations
 */
export enum RoleBits {
  /** 0001 = 1 */
  VIEWER = PermissionBits.VIEW,
  /** 0011 = 3 */
  EDITOR = PermissionBits.VIEW | PermissionBits.EDIT,
  /** 0111 = 7 */
  MANAGER = PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE,
  /** 1111 = 15 */
  OWNER = PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
}
