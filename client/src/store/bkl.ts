import { atom } from 'recoil';

const STORAGE_KEY = 'bkl_query_enhance_enabled';

const readInitial = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeStorage = (v: boolean) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (v) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
};

export const queryEnhanceEnabled = atom<boolean>({
  key: 'bklQueryEnhanceEnabled',
  default: readInitial(),
  effects: [
    ({ onSet }) => {
      onSet((newValue) => writeStorage(!!newValue));
    },
  ],
});

export interface BklMatterSelection {
  matter_uid: string;
  label: string;
  sub?: string;
}

export interface BklDocSelection {
  doc_id: string;
  label: string;
}

export const filterBklMatters = atom<BklMatterSelection[]>({
  key: 'bklFilterMatters',
  default: [],
});

export const filterBklDocs = atom<BklDocSelection[]>({
  key: 'bklFilterDocs',
  default: [],
});

export const selectedBklMatters = atom<BklMatterSelection[]>({
  key: 'bklSelectedMatters',
  default: [],
});

export const referenceBklMatters = selectedBklMatters;

const TOP_BANNER_KEY = 'bkl_top_banner_dismissed_v1';

const readBannerInitial = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(TOP_BANNER_KEY) === '1';
  } catch {
    return false;
  }
};

const writeBanner = (v: boolean) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (v) localStorage.setItem(TOP_BANNER_KEY, '1');
    else localStorage.removeItem(TOP_BANNER_KEY);
  } catch {
    // noop
  }
};

export const topBannerDismissed = atom<boolean>({
  key: 'bklTopBannerDismissed',
  default: readBannerInitial(),
  effects: [
    ({ onSet }) => {
      onSet((v) => writeBanner(!!v));
    },
  ],
});
