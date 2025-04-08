import { initModelData } from './modelBadges';
import ResponseCost from './ResponseCost';
import KeyboardShortcuts from './KeyboardShortcuts';
import ShortcutsHelp from './ShortcutsHelp';
import ForkedCustomizations from './ForkedCustomizations';

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
  KeyboardShortcuts,
  initModelData,
};

export default {
  ForkedCustomizations,
};
