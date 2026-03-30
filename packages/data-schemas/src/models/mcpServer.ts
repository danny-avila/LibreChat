import mcpServerSchema from '~/schema/mcpServer';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { MCPServerDocument } from '~/types';

export function createMCPServerModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(mcpServerSchema);
  return (
    mongoose.models.MCPServer || mongoose.model<MCPServerDocument>('MCPServer', mcpServerSchema)
  );
}
