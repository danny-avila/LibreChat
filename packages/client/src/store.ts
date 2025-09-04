import { atom } from 'jotai';
import { NotificationSeverity } from '~/common';

export const langAtom = atom<string>('en');
export const chatDirectionAtom = atom<string>('ltr');
export const fontSizeAtom = atom<string>('text-base');

export type ToastState = {
  open: boolean;
  message: string;
  severity: NotificationSeverity;
  showIcon: boolean;
};

export const toastState = atom<ToastState>({
  open: false,
  message: '',
  severity: NotificationSeverity.SUCCESS,
  showIcon: true,
});
