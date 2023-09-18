import conversation from './conversation';
import conversations from './conversations';
import endpoints from './endpoints';
import models from './models';
import user from './user';
import text from './text';
import submission from './submission';
import search from './search';
import preset from './preset';
import lang from './language';
import optionSettings from './optionSettings';

export default {
  ...conversation,
  ...conversations,
  ...endpoints,
  ...models,
  ...user,
  ...text,
  ...submission,
  ...search,
  ...preset,
  ...lang,
  ...optionSettings,
};
