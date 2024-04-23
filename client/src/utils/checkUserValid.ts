import { isPast } from 'date-fns';
import isEmpty from 'is-empty';
import { TConversation, TMessage, TUser } from 'librechat-data-provider';

export const isPremiumUser = (user: TUser) => {
  return (
    !isEmpty(user?.subscription.renewalDate) && !isPast(user?.subscription.renewalDate as Date)
  );
};

export const isYou = (user: TUser, conversation: TConversation) => {
  let isValid = false;
  const users = conversation.users;
  const checkUser = { ...user, id: user.id ? user.id : user._id };

  if (typeof conversation.user === 'string' && checkUser.id === conversation.user) {
    isValid = true;
  }

  if (typeof conversation.user !== 'string' && checkUser.id === conversation.user?._id) {
    isValid = true;
  }

  if (users?.map((i) => i._id || i.id).indexOf(checkUser.id) !== -1) {
    isValid = true;
  }

  return isValid;
};

export const isRoomOwner = (user: TUser, conversation: TConversation) => {
  let isValid = false;

  // const checkUser = { ...user, id: user.id ? user.id : user._id };
  // if (typeof conversation.user === 'string' && checkUser.id === conversation.user) {
  //   isValid = true;
  // }

  if (user.id === conversation.user?.id) {
    isValid = true;
  }

  return isValid;
};

export const isMessageOwner = (user: TUser, message: TMessage) => {
  if (message.user?._id === user.id) {
    return true;
  }
  return false;
};
