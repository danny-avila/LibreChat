import { isPast } from 'date-fns';
import isEmpty from 'is-empty';

export const isPremiumUser = (user: any) => {
  return (
    !isEmpty(user?.subscription.renewalDate) && !isPast(user?.subscription.renewalDate as Date)
  );
};
