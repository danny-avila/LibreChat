import toolCallSchema, { IToolCallData } from '~/schema/toolCall';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createToolCallModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(toolCallSchema);
  return mongoose.models.ToolCall || mongoose.model<IToolCallData>('ToolCall', toolCallSchema);
}
