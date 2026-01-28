import mcpServerSchema from '~/schema/mcpServer';
import type { MCPServerDocument } from '~/types';

/**
 * Creates or returns the MCPServer model using the provided mongoose instance and schema
 */
export function createMCPServerModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.MCPServer || mongoose.model<MCPServerDocument>('MCPServer', mcpServerSchema)
  );
}
