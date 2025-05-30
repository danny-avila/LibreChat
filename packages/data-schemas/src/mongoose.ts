/**
 * Mongoose peer dependency loader
 * This handles loading mongoose from the parent project for proper peer dependency resolution
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mongoose: any;

try {
  // First try to require mongoose normally (this works in production)
  mongoose = require('mongoose');
} catch (error) {
  try {
    // If that fails, try to require from parent context (for npm link scenarios)
    // This is the TypeScript equivalent of the parent-require solution
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    
    // Try to find mongoose in parent module paths
    const parentPaths = require.main?.paths || [];
    for (const parentPath of parentPaths) {
      try {
        const parentRequire = Module.createRequire(parentPath + '/package.json');
        mongoose = parentRequire('mongoose');
        break;
      } catch {
        // Continue to next path
      }
    }
    
    if (!mongoose) {
      // Last resort: use eval to get parent require
      const parentRequire = eval('require');
      mongoose = parentRequire('mongoose');
    }
  } catch (parentError) {
    throw new Error(
      'Could not load mongoose. Make sure mongoose is installed in the parent project or available as a peer dependency.\n' +
      `Local require error: ${error}\n` +
      `Parent require error: ${parentError}`
    );
  }
}

export default mongoose;

// Also export common mongoose items for convenience
export const {
  Schema,
  model,
  models,
  connect,
  connection,
  Document,
  Types,
  Query,
  Model,
} = mongoose; 