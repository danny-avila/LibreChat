import { atom, useRecoilState } from 'recoil';

const tokenRefreshHints = atom({
  key: 'tokenRefreshHints',
  default: 1
});

const useToken = (endpoint) => {
  const [hints, setHints] = useRecoilState(tokenRefreshHints);
  const getToken = () => localStorage.getItem(`${endpoint}_token`);
  const saveToken = (value) => {
    localStorage.setItem(`${endpoint}_token`, value);
    setHints(prev => prev + 1);
  };

  return { token: getToken(), getToken, saveToken };
};

export default {
  useToken
};
