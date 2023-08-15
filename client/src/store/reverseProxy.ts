import { atom } from 'recoil';

const reverse = atom({
  key: 'endpoint',
  default: 'openai',
});

export default { reverse };
