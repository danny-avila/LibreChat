import subscriptionSchema from '~/schema/subscription';
import type { ISubscription } from '~/types/subscription';

export function createSubscriptionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Subscription ||
    mongoose.model<ISubscription>('Subscription', subscriptionSchema)
  );
}
