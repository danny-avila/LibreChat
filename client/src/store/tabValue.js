import { atom } from 'recoil';

const tabValue = atom({
  key: 'tabValue',
  default: 'recent'
});

export default {
  tabValue
};