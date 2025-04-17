import { initLiteLLMModelData, useModelPricingInfo } from './litellmInfoAdapter';
import ResponseCost from './ResponseCost';
import { initialize, cleanup } from './KeyboardShortcuts';
import ShortcutsHelp from './ShortcutsHelp';
import ForkedCustomizations from './ForkedCustomizations';
import { PromptSuggestions } from './PromptSuggestions';
import { ModelBadges } from './modelBadges';
import { CapabilityIcons } from './CapabilityIcons';

/**
 * Exports for forked customizations
 *
 * The initialization is now handled by the ForkedCustomizations component
 * which mounts in the React tree. This avoids duplicate initialization.
 */

export {
  ResponseCost,
  ShortcutsHelp,
  ForkedCustomizations,
  initialize,
  cleanup,
  initLiteLLMModelData,
  PromptSuggestions,
  ModelBadges,
  useModelPricingInfo,
  CapabilityIcons,
};

export default {
  ForkedCustomizations,
};
