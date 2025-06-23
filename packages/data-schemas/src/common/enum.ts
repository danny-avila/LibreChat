/**
 * Permission bit flags
 */
export enum PermissionBits {
  /** 0001 - Can view/access the resource */
  VIEW = 1,
  /** 0010 - Can modify the resource */
  EDIT = 2,
  /** 0100 - Can delete the resource */
  DELETE = 4,
  /** 1000 - Can share the resource with others */
  SHARE = 8,
}

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
