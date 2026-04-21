import { atom } from 'recoil';

export type MessageTiming = {
  startTime: number;
  firstTokenTime: number | null;
  endTime: number | null;
};

const messageTimingMap = atom<Record<string, MessageTiming>>({
  key: 'messageTimingMap',
  default: {},
});

export default { messageTimingMap };
