import userProjectSchema from '~/schema/userProject';
import type { IUserProject } from '~/types/userProject';

export function createUserProjectModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.UserProject || mongoose.model<IUserProject>('UserProject', userProjectSchema);
}
