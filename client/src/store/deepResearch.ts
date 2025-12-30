import { atomWithLocalStorage } from './utils';

const isDeepResearch = atomWithLocalStorage('isDeepResearch', false);

export default {
  isDeepResearch,
};
