import { atom, PrimitiveAtom } from 'jotai';
import { NotificationSeverity } from '~/common';

export const chatDirectionAtom: PrimitiveAtom<string> & {
  init: string;
} = atom<string>('ltr');
export const fontSizeAtom: PrimitiveAtom<string> & {
  init: string;
} = atom<string>('text-base');

export type ToastState = {
  open: boolean;
  message: string;
  severity: NotificationSeverity;
  showIcon: boolean;
};

export const toastState: PrimitiveAtom<ToastState> & {
  init: ToastState;
} = atom<ToastState>({
  open: false,
  message: '',
  severity: NotificationSeverity.SUCCESS,
  showIcon: true,
});
