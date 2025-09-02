/**
 * Admin plugin initialization
 */
import { generateMergedYaml } from './services/generateMergedConfig';

export { buildAdminRouter } from './router';

// Initialize admin configuration on module load
(async () => {
  try {
    await generateMergedYaml({ preStartup: true });
  } catch (error) {
    // Silently fail during initialization
  }
})(); 