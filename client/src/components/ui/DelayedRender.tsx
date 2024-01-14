import { useDelayedRender } from '~/hooks';

const DelayedRender = ({ delay, children }) => useDelayedRender(delay)(() => children);

export default DelayedRender;
