import conversation from './conversation';
import conversations from './conversations';
import models from './models';
import user from './user';
import submission from './submission';
import search from './search';

export default {
  ...conversation,
  ...conversations,
  ...models,
  ...user,
  ...submission,
  ...search
};
