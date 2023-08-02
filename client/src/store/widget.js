import { atom } from 'recoil';

const widget = atom({
  key: 'widget',
  default: ''
});

export default {
  widget
};