import { atomWithLocalStorage } from '~/store/utils';

const isTemporary = atomWithLocalStorage('isTemporary', true);

export default {
  isTemporary,
};
