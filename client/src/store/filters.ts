import { atom } from 'recoil';

export type PeriodFilterPreset =
  | 'all'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_1_year'
  | 'last_3_years'
  | 'last_5_years'
  | 'custom';

export interface PeriodFilterState {
  preset: PeriodFilterPreset;
  startDate: string | null;
  endDate: string | null;
}

export const DEFAULT_PERIOD_FILTER: PeriodFilterState = {
  preset: 'all',
  startDate: null,
  endDate: null,
};

const periodFilter = atom<PeriodFilterState>({
  key: 'periodFilter',
  default: DEFAULT_PERIOD_FILTER,
});

export default { periodFilter };
