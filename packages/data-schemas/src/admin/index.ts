export * from './capabilities';
export type { InterfacePermissionUiNode } from './configOverrides';
export {
  INTERFACE_PERMISSION_UI_SHAPES,
  isForbiddenAdminConfigPath,
  sanitizeAdminConfigOverrides,
  sanitizeAdminConfigTombstones,
} from './configOverrides';
export { indexedArrayPathError, isConfigFieldPath } from './indexedArrayPath';
