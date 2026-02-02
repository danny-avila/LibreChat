/**
 * Recoil state for Social Draft modal (Start Social Draft)
 */
import { atom } from 'recoil';

export interface SocialDraftState {
  isOpen: boolean;
}

export const socialDraftState = atom<SocialDraftState>({
  key: 'socialDraftState',
  default: {
    isOpen: false,
  },
});
