import { atom, useSetRecoilState } from 'recoil';

const tokenRefreshHints = atom<number>({
  key: 'tokenRefreshHints',
  default: 1,
});

const useToken = (endpoint: string) => {
  const setHints = useSetRecoilState(tokenRefreshHints);
  const getToken = () => localStorage.getItem(`${endpoint}_token`);
  const saveToken = (value: string) => {
    localStorage.setItem(`${endpoint}_token`, value);
    setHints((prev) => prev + 1);
  };

  return { token: getToken(), getToken, saveToken };
};

export default {
  useToken,
};
