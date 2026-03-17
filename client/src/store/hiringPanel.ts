import { atom } from 'recoil';

export interface HiringPanelState {
  isOpen: boolean;
}

export const hiringPanelState = atom<HiringPanelState>({
  key: 'hiringPanelState',
  default: { isOpen: false },
});
