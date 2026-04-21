import { atom } from 'jotai';

export type MessageTiming = {
  startTime: number;
  firstTokenTime: number | null;
  endTime: number | null;
};

export const messageTimingMapAtom = atom<Record<string, MessageTiming>>({});
