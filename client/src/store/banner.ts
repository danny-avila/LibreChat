import { atomWithLocalStorage } from './utils';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

export default { hideBannerHint };
