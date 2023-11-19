import conversation from './conversation';
import conversations from './conversations';
import families from './families';
import endpoints from './endpoints';
import models from './models';
import user from './user';
import text from './text';
import toast from './toast';
import submission from './submission';
import search from './search';
import preset from './preset';
import lang from './language';
import settings from './settings';

export default {
  ...families,
  ...conversation,
  ...conversations,
  ...endpoints,
  ...models,
  ...user,
  ...text,
  ...toast,
  ...submission,
  ...search,
  ...preset,
  ...lang,
  ...settings,
};
