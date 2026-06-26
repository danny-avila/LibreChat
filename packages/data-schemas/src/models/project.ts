import projectSchema from '~/schema/project';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { Model } from 'mongoose';
import type { IProject } from '~/types';

export function createProjectModel(mongoose: typeof import('mongoose')): Model<IProject> {
  applyTenantIsolation(projectSchema);
  return mongoose.models.Project || mongoose.model<IProject>('Project', projectSchema);
}
