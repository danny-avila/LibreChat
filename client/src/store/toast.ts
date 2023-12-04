import { atom } from 'recoil';
import { NotificationSeverity } from '~/common';

const toastState = atom({
  key: 'toastState',
  default: {
    open: false,
    message: '',
    severity: NotificationSeverity.SUCCESS,
    showIcon: true,
  },
});

export default { toastState };
