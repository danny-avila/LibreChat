import { atom } from 'recoil';

const endpoint = atom({
  key: 'endpoint',
  default: 'openai',
});

export default { endpoint };
