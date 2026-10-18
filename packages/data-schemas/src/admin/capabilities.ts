/**
 * System capabilities live in `librechat-data-provider`, shared with the admin panel in the
 * client; this module re-exports them for the server.
 */
export {
  SystemCapabilities,
  CapabilityImplications,
  isValidCapability,
  hasImpliedCapability,
  expandImplications,
  ResourceCapabilityMap,
  configCapability,
  readConfigCapability,
  BASE_CONFIG_PRINCIPAL_ID,
  CAPABILITY_CATEGORIES,
} from 'librechat-data-provider';
export type {
  BaseSystemCapability,
  ConfigAssignTarget,
  ConfigSection,
  SystemCapability,
  CapabilityCategory,
} from 'librechat-data-provider';
