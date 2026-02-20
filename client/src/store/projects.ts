import { atomWithLocalStorage } from '~/store/utils';

const activeProjectId = atomWithLocalStorage<string | null>('activeProjectId', null);

export default {
  activeProjectId,
};
