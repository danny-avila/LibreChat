import userProfileSchema from '~/schema/userProfile';
import type { IUserProfileDocument } from '~/types/userProfile';

export function createUserProfileModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.UserProfile ||
    mongoose.model<IUserProfileDocument>('UserProfile', userProfileSchema)
  );
}
