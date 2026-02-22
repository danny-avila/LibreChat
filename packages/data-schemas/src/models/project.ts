import projectSchema, { IMongoProject } from '~/schema/project';

/**
 * Creates or returns the Project model using the provided mongoose instance and schema
 */
export function createProjectModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Project || mongoose.model<IMongoProject>('Project', projectSchema);
}
