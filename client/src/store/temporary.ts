import { atomWithStorage } from 'jotai/utils';

const isTemporary = atomWithStorage('isTemporary', false);

export default {
  isTemporary,
};
