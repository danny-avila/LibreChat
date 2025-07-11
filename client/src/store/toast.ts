import { atom } from 'jotai';
import { NotificationSeverity } from '~/common';

const toastState = atom({
  open: false,
  message: '',
  severity: NotificationSeverity.SUCCESS,
  showIcon: true,
});

export default { toastState };
