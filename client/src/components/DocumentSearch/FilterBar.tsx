import React, { useCallback, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ko, enUS } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import { CalendarDays, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type ExtensionGroup = 'pdf' | 'msg' | 'docx' | 'hwpx' | 'pptx' | 'other';
export type PeriodPreset =
  | 'all'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_1_year'
  | 'last_3_years'
  | 'last_5_years'
  | 'custom';

export interface DocumentSearchFilterState {
  preset: PeriodPreset;
  /** YYYY-MM-DD (inclusive) */
  startDate: string | null;
  /** YYYY-MM-DD (inclusive) */
  endDate: string | null;
  extensionGroups: ExtensionGroup[];
}

export const EMPTY_DOC_FILTERS: DocumentSearchFilterState = {
  preset: 'all',
  startDate: null,
  endDate: null,
  extensionGroups: [],
};

const EXTENSION_OPTIONS: {
  id: ExtensionGroup;
  label: string;
  hint: string;
}[] = [
  { id: 'pdf', label: 'PDF', hint: 'pdf' },
  { id: 'msg', label: 'MSG', hint: 'msg' },
  { id: 'docx', label: 'DOCX', hint: 'doc/docx' },
  { id: 'hwpx', label: 'HWPX', hint: 'hwp/hwpx' },
  { id: 'pptx', label: 'PPTX', hint: 'ppt/pptx' },
  { id: 'other', label: '기타', hint: 'other' },
];

const PRESET_OPTIONS: { preset: Exclude<PeriodPreset, 'custom'>; labelKey: string }[] = [
  { preset: 'all', labelKey: 'com_ui_period_all' },
  { preset: 'last_3_months', labelKey: 'com_ui_period_last_3_months' },
  { preset: 'last_6_months', labelKey: 'com_ui_period_last_6_months' },
  { preset: 'last_1_year', labelKey: 'com_ui_period_last_1_year' },
  { preset: 'last_3_years', labelKey: 'com_ui_period_last_3_years' },
  { preset: 'last_5_years', labelKey: 'com_ui_period_last_5_years' },
];

const DATE_FMT = 'yyyy-MM-dd';

function parseDateSafe(value: string | null): Date | undefined {
  if (!value) return undefined;
  try {
    return parseISO(value);
  } catch {
    return undefined;
  }
}

function presetToRange(preset: PeriodPreset): { from: string | null; to: string | null } {
  if (preset === 'all' || preset === 'custom') return { from: null, to: null };
  const now = new Date();
  const end = now;
  const start = new Date(now);
  switch (preset) {
    case 'last_3_months':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'last_6_months':
      start.setMonth(start.getMonth() - 6);
      break;
    case 'last_1_year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'last_3_years':
      start.setFullYear(start.getFullYear() - 3);
      break;
    case 'last_5_years':
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  return { from: format(start, DATE_FMT), to: format(end, DATE_FMT) };
}

export function resolvePeriodRange(state: DocumentSearchFilterState): {
  from: string | null;
  to: string | null;
} {
  if (state.preset === 'custom') {
    return { from: state.startDate, to: state.endDate };
  }
  return presetToRange(state.preset);
}

export function isFilterActive(state: DocumentSearchFilterState): boolean {
  return (
    state.preset !== 'all' ||
    state.startDate !== null ||
    state.endDate !== null ||
    state.extensionGroups.length > 0
  );
}

interface FilterBarProps {
  value: DocumentSearchFilterState;
  onChange: (next: DocumentSearchFilterState) => void;
  disabled?: boolean;
}

const FilterBar: React.FC<FilterBarProps> = ({ value, onChange, disabled }) => {
  const localize = useLocalize();
  const [periodOpen, setPeriodOpen] = useState(false);
  const [activeField, setActiveField] = useState<'start' | 'end' | null>(null);

  const menu = Ariakit.useMenuStore({ open: periodOpen, setOpen: setPeriodOpen });

  const dpLocale = useMemo(() => {
    if (typeof navigator !== 'undefined') {
      const stored = localStorage.getItem('lang') ?? '';
      if (stored.includes('ko') || navigator.language.startsWith('ko')) return ko;
    }
    return enUS;
  }, []);

  const startDate = useMemo(() => parseDateSafe(value.startDate), [value.startDate]);
  const endDate = useMemo(() => parseDateSafe(value.endDate), [value.endDate]);

  const periodLabel = useMemo(() => {
    if (value.preset === 'custom') {
      const left = value.startDate ?? localize('com_ui_period_start');
      const right = value.endDate ?? localize('com_ui_period_end');
      return `${left} ~ ${right}`;
    }
    const found = PRESET_OPTIONS.find((p) => p.preset === value.preset);
    return localize((found?.labelKey ?? 'com_ui_period_all') as Parameters<typeof localize>[0]);
  }, [value.preset, value.startDate, value.endDate, localize]);

  const selectPreset = useCallback(
    (preset: Exclude<PeriodPreset, 'custom'>) => {
      onChange({ ...value, preset, startDate: null, endDate: null });
      setActiveField(null);
      setPeriodOpen(false);
    },
    [onChange, value],
  );

  const selectDate = useCallback(
    (field: 'start' | 'end', day: Date | undefined) => {
      const nextValue = day ? format(day, DATE_FMT) : null;
      const nextState: DocumentSearchFilterState =
        field === 'start'
          ? {
              ...value,
              preset: 'custom',
              startDate: nextValue,
              endDate:
                nextValue && value.endDate && new Date(nextValue) > new Date(value.endDate)
                  ? null
                  : value.endDate,
            }
          : {
              ...value,
              preset: 'custom',
              startDate:
                nextValue && value.startDate && new Date(nextValue) < new Date(value.startDate)
                  ? null
                  : value.startDate,
              endDate: nextValue,
            };
      onChange(nextState);
      setActiveField(null);
    },
    [onChange, value],
  );

  const toggleExt = useCallback(
    (id: ExtensionGroup) => {
      const set = new Set(value.extensionGroups);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onChange({ ...value, extensionGroups: Array.from(set) });
    },
    [onChange, value],
  );

  const resetAll = useCallback(() => {
    onChange(EMPTY_DOC_FILTERS);
    setActiveField(null);
    setPeriodOpen(false);
  }, [onChange]);

  const activeSelected = activeField === 'start' ? startDate : endDate;
  const activeDefaultMonth = activeSelected ?? startDate ?? endDate ?? new Date();
  const activeDisabled = useMemo(() => {
    if (activeField === 'start' && endDate) return { after: endDate };
    if (activeField === 'end' && startDate) return { before: startDate };
    return undefined;
  }, [activeField, startDate, endDate]);

  const hasAny = isFilterActive(value);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {/* 기간 */}
      <Ariakit.MenuProvider store={menu}>
        <Ariakit.MenuButton
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-full border border-border-medium bg-surface-primary px-3.5 text-sm text-text-primary transition-colors hover:border-border-heavy',
            (periodOpen || value.preset !== 'all') && 'border-text-primary',
          )}
          aria-label={localize('com_document_search_filter_period')}
        >
          <CalendarDays className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <span className="text-text-secondary">
            {localize('com_document_search_filter_period')}:
          </span>
          <span className="font-medium tabular-nums">{periodLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
        </Ariakit.MenuButton>
        <Ariakit.Menu
          portal
          unmountOnHide
          gutter={6}
          flip={false}
          placement="bottom-start"
          className="popover-ui z-50 w-[320px] !overflow-visible !p-2"
        >
          <div className="px-2.5 pb-1 pt-0.5 text-xs font-medium text-text-secondary">
            {localize('com_ui_period_quick_access')}
          </div>
          {PRESET_OPTIONS.map((opt) => {
            const isSelected =
              value.preset === opt.preset && value.startDate === null && value.endDate === null;
            return (
              <Ariakit.MenuItem
                key={opt.preset}
                hideOnClick={false}
                onClick={() => selectPreset(opt.preset)}
                className="group flex w-full cursor-pointer items-center justify-between gap-5 rounded-lg px-2.5 py-2 text-sm text-text-primary outline-none hover:bg-surface-hover focus:bg-surface-hover"
              >
                <span>{localize(opt.labelKey as Parameters<typeof localize>[0])}</span>
                {isSelected && <Check className="h-4 w-4 text-text-primary" aria-hidden="true" />}
              </Ariakit.MenuItem>
            );
          })}
          <Ariakit.MenuSeparator className="my-1 h-px border-border-medium" />
          <div className="flex items-center justify-between px-2.5 py-1">
            <span className="text-xs font-medium text-text-secondary">
              {localize('com_ui_period_custom')}
            </span>
            {value.preset === 'custom' && (
              <Check className="h-4 w-4 text-text-primary" aria-hidden="true" />
            )}
          </div>
          <div className="flex items-center gap-1.5 px-1 pb-1">
            <DateField
              label={localize('com_ui_period_start')}
              value={value.startDate}
              placeholder={localize('com_ui_period_pick')}
              isOpen={activeField === 'start'}
              onToggle={() => setActiveField((p) => (p === 'start' ? null : 'start'))}
            />
            <DateField
              label={localize('com_ui_period_end')}
              value={value.endDate}
              placeholder={localize('com_ui_period_pick')}
              isOpen={activeField === 'end'}
              onToggle={() => setActiveField((p) => (p === 'end' ? null : 'end'))}
            />
          </div>
          {activeField && (
            <div
              className="rdp-bkl mx-1 mb-1 mt-1 rounded-lg border border-border-light bg-surface-primary p-1"
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DayPicker
                mode="single"
                selected={activeSelected}
                onSelect={(d) => selectDate(activeField, d)}
                locale={dpLocale}
                numberOfMonths={1}
                defaultMonth={activeDefaultMonth}
                disabled={activeDisabled}
                showOutsideDays
                weekStartsOn={0}
              />
            </div>
          )}
        </Ariakit.Menu>
      </Ariakit.MenuProvider>

      {/* 확장자 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {EXTENSION_OPTIONS.map((opt) => {
          const active = value.extensionGroups.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleExt(opt.id)}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                active
                  ? 'border-text-primary bg-text-primary text-surface-primary'
                  : 'border-border-medium bg-surface-primary text-text-secondary hover:border-border-heavy hover:text-text-primary',
              )}
              aria-pressed={active}
              title={opt.hint}
            >
              {active && <Check className="h-3 w-3" aria-hidden="true" />}
              {opt.label}
            </button>
          );
        })}
      </div>

      {hasAny && (
        <button
          type="button"
          onClick={resetAll}
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs text-text-secondary hover:text-text-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {localize('com_ui_period_clear')}
        </button>
      )}
    </div>
  );
};

interface DateFieldProps {
  label: string;
  value: string | null;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
}

const DateField: React.FC<DateFieldProps> = ({ label, value, placeholder, isOpen, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      'flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md border border-border-light bg-surface-primary px-2.5 py-1.5 text-left transition-colors',
      'hover:border-border-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',
      isOpen && 'border-blue-500',
    )}
  >
    <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
      {label}
    </span>
    <span className="w-full truncate whitespace-nowrap text-sm tabular-nums text-text-primary">
      {value ?? <span className="text-text-secondary">{placeholder}</span>}
    </span>
  </button>
);

export default FilterBar;
