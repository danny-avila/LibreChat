import subscriptionProfileSchema, { IMongoSubscriptionProfile } from '~/schema/subscriptionProfile';

/**
 * Creates or returns the SubscriptionProfile model using the provided mongoose instance and schema
 */
export function createSubscriptionProfileModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SubscriptionProfile ||
    mongoose.model<IMongoSubscriptionProfile>('SubscriptionProfile', subscriptionProfileSchema)
  );
}
