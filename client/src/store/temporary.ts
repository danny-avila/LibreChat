import { atomWithLocalStorage } from '~/store/utils';
import { constRecoilState } from '~/nj/utils/constRecoilState';

// NJ: We are forcing all chats to be temporary
const isTemporary = constRecoilState('isTemporary', true);

export default {
  isTemporary,
};
