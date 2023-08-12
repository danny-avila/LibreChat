import { atom } from 'recoil';

const reverseProxyIsActiveState = atom({
  key: 'reverseProxyIsActiveState',
  default: false,
});

const reverseProxyUrlState = atom({
  key: 'reverseProxyUrlState',
  default: '',
});

const reverseProxyApiState = atom({
  key: 'reverseProxyApiState',
  default: '',
});

export default { reverseProxyIsActiveState, reverseProxyUrlState, reverseProxyApiState };
