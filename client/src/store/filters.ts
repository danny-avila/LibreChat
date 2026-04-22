import { atom } from 'recoil';

export type PeriodFilterPreset =
  | 'all'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_1_year'
  | 'last_3_years'
  | 'last_5_years'
  | 'custom';

// 문서 검색 FilterBar 와 동일한 6 그룹. 백엔드가 group → 실제 확장자 리스트로 전개한다.
export type ExtensionGroup = 'pdf' | 'msg' | 'docx' | 'hwpx' | 'pptx' | 'other';

export interface PeriodFilterState {
  preset: PeriodFilterPreset;
  startDate: string | null;
  endDate: string | null;
  extensionGroups: ExtensionGroup[];
}

export const DEFAULT_PERIOD_FILTER: PeriodFilterState = {
  preset: 'all',
  startDate: null,
  endDate: null,
  extensionGroups: [],
};

const periodFilter = atom<PeriodFilterState>({
  key: 'periodFilter',
  default: DEFAULT_PERIOD_FILTER,
});

export default { periodFilter };
