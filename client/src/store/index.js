import conversation from './conversation';
import conversations from './conversations';
import models from './models';
import endpoints from './endpoints';
import user from './user';
import text from './text';
import submission from './submission';
import search from './search';

export default {
  ...conversation,
  ...conversations,
  ...models,
  ...endpoints,
  ...user,
  text,
  ...submission,
  ...search
};
