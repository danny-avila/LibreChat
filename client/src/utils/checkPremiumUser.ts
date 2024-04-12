import { isPast } from 'date-fns';
import isEmpty from 'is-empty';
import { TUser } from 'librechat-data-provider';

export const isPremiumUser = (user: TUser) => {
  return (
    !isEmpty(user?.subscription.renewalDate) && !isPast(user?.subscription.renewalDate as Date)
  );
};
