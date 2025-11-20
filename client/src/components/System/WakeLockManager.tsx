import { useRecoilValue } from 'recoil';
import store from '~/store';
import useWakeLock from '~/hooks/useWakeLock';

const WakeLockManager = () => {
  const shouldPreventSleep = useRecoilValue(store.anySubmittingSelector);
  useWakeLock(shouldPreventSleep);

  return null;
};

export default WakeLockManager;

