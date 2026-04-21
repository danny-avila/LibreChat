import React, { useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { useRecoilState } from 'recoil';
import { ko, enUS } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import { Check, Filter, X } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { PeriodFilterPreset, PeriodFilterState } from '~/store/filters';
import { DEFAULT_PERIOD_FILTER } from '~/store/filters';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

interface FilterDropdownProps {
  disabled?: boolean;
}

type DateField = 'start' | 'end';

interface QuickOption {
  preset: Exclude<PeriodFilterPreset, 'custom'>;
  labelKey: string;
}

const QUICK_OPTIONS: QuickOption[] = [
  { preset: 'all', labelKey: 'com_ui_period_all' },
  { preset: 'last_3_months', labelKey: 'com_ui_period_last_3_months' },
  { preset: 'last_6_months', labelKey: 'com_ui_period_last_6_months' },
  { preset: 'last_1_year', labelKey: 'com_ui_period_last_1_year' },
  { preset: 'last_3_years', labelKey: 'com_ui_period_last_3_years' },
  { preset: 'last_5_years', labelKey: 'com_ui_period_last_5_years' },
];

const DATE_FMT = 'yyyy-MM-dd';

const parseDate = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  try {
    return parseISO(value);
  } catch {
    return undefined;
  }
};

const isActiveFilter = (state: PeriodFilterState): boolean =>
  state.preset !== DEFAULT_PERIOD_FILTER.preset ||
  state.startDate !== null ||
  state.endDate !== null;

interface DateTriggerProps {
  label: string;
  value: string | null;
  placeholderKey: string;
  isOpen: boolean;
  onToggle: () => void;
}

const DateTrigger = React.forwardRef<HTMLButtonElement, DateTriggerProps>(
  ({ label, value, placeholderKey, isOpen, onToggle }, ref) => {
    const localize = useLocalize();
    return (
      <button
        ref={ref}
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
          {value ?? (
            <span className="text-text-secondary">
              {localize(placeholderKey as Parameters<typeof localize>[0])}
            </span>
          )}
        </span>
      </button>
    );
  },
);
DateTrigger.displayName = 'DateTrigger';

const FilterDropdown = ({ disabled }: FilterDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [isOpen, setIsOpen] = useState(false);
  const [activeField, setActiveField] = useState<DateField | null>(null);
  const [periodFilter, setPeriodFilter] = useRecoilState(store.periodFilter);

  const menu = Ariakit.useMenuStore({ open: isOpen, setOpen: setIsOpen });

  const handleSelectPreset = useCallback(
    (preset: Exclude<PeriodFilterPreset, 'custom'>) => {
      setPeriodFilter({ preset, startDate: null, endDate: null });
      setActiveField(null);
      setIsOpen(false);
    },
    [setPeriodFilter],
  );

  const handleSelectDate = useCallback(
    (field: DateField, day: Date | undefined) => {
      const value = day ? format(day, DATE_FMT) : null;
      setPeriodFilter((prev) => {
        if (field === 'start') {
          const nextEnd =
            value && prev.endDate && new Date(value) > new Date(prev.endDate)
              ? null
              : prev.endDate;
          return { preset: 'custom', startDate: value, endDate: nextEnd };
        }
        const nextStart =
          value && prev.startDate && new Date(value) < new Date(prev.startDate)
            ? null
            : prev.startDate;
        return { preset: 'custom', startDate: nextStart, endDate: value };
      });
      setActiveField(null);
    },
    [setPeriodFilter],
  );

  const handleClear = useCallback(() => {
    setPeriodFilter(DEFAULT_PERIOD_FILTER);
    setActiveField(null);
  }, [setPeriodFilter]);

  const toggleField = useCallback(
    (field: DateField) => setActiveField((prev) => (prev === field ? null : field)),
    [],
  );

  const isActive = useMemo(() => isActiveFilter(periodFilter), [periodFilter]);

  const dpLocale = useMemo(() => {
    if (typeof navigator !== 'undefined') {
      const stored = localStorage.getItem('lang') ?? '';
      if (stored.includes('ko') || navigator.language.startsWith('ko')) {
        return ko;
      }
    }
    return enUS;
  }, []);

  const startDate = useMemo(() => parseDate(periodFilter.startDate), [periodFilter.startDate]);
  const endDate = useMemo(() => parseDate(periodFilter.endDate), [periodFilter.endDate]);

  const activeSelected = activeField === 'start' ? startDate : endDate;
  const activeDefaultMonth = activeSelected ?? startDate ?? endDate ?? new Date();

  const activeDisabled = useMemo(() => {
    if (activeField === 'start' && endDate) {
      return { after: endDate };
    }
    if (activeField === 'end' && startDate) {
      return { before: startDate };
    }
    return undefined;
  }, [activeField, startDate, endDate]);

  return (
    <Ariakit.MenuProvider store={menu}>
      <TooltipAnchor
        render={
          <Ariakit.MenuButton
            disabled={isDisabled}
            id="filter-dropdown-button"
            aria-label="Filters"
            className={cn(
              'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
              (isOpen || isActive) && 'bg-surface-hover',
            )}
          >
            <div className="flex w-full items-center justify-center gap-2">
              <Filter
                className={cn('size-5', isActive && 'text-blue-500')}
                aria-hidden="true"
              />
            </div>
          </Ariakit.MenuButton>
        }
        id="filter-dropdown-button"
        description={localize('com_ui_filters')}
        disabled={isDisabled}
      />
      <Ariakit.Menu
        portal
        unmountOnHide
        gutter={4}
        flip={false}
        placement="bottom-start"
        hideOnHoverOutside={false}
        className="popover-ui z-50 w-[300px] !overflow-visible !p-2"
      >
        <div className="px-2.5 pb-1 pt-0.5 text-xs font-medium text-text-secondary">
          {localize('com_ui_period_quick_access')}
        </div>
        {QUICK_OPTIONS.map((option) => {
          const isSelected =
            periodFilter.preset === option.preset &&
            periodFilter.startDate === null &&
            periodFilter.endDate === null;
          return (
            <Ariakit.MenuItem
              key={option.preset}
              hideOnClick={false}
              onClick={() => handleSelectPreset(option.preset)}
              className="group flex w-full cursor-pointer items-center justify-between gap-5 rounded-lg px-3 py-3.5 text-sm text-text-primary outline-none hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2"
            >
              <span>{localize(option.labelKey as Parameters<typeof localize>[0])}</span>
              {isSelected && (
                <Check className="h-4 w-4 text-text-primary" aria-hidden="true" />
              )}
            </Ariakit.MenuItem>
          );
        })}
        <Ariakit.MenuSeparator className="my-1 h-px border-border-medium" />
        <div className="flex items-center justify-between px-2.5 py-1">
          <span className="text-xs font-medium text-text-secondary">
            {localize('com_ui_period_custom')}
          </span>
          {periodFilter.preset === 'custom' && (
            <Check className="h-4 w-4 text-text-primary" aria-hidden="true" />
          )}
        </div>
        <div className="flex items-center gap-1.5 px-1 pb-1">
          <DateTrigger
            label={localize('com_ui_period_start')}
            value={periodFilter.startDate}
            placeholderKey="com_ui_period_pick"
            isOpen={activeField === 'start'}
            onToggle={() => toggleField('start')}
          />
          <DateTrigger
            label={localize('com_ui_period_end')}
            value={periodFilter.endDate}
            placeholderKey="com_ui_period_pick"
            isOpen={activeField === 'end'}
            onToggle={() => toggleField('end')}
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
              onSelect={(d) => handleSelectDate(activeField, d)}
              locale={dpLocale}
              numberOfMonths={1}
              defaultMonth={activeDefaultMonth}
              disabled={activeDisabled}
              showOutsideDays
              weekStartsOn={0}
            />
          </div>
        )}
        {isActive && (
          <>
            <Ariakit.MenuSeparator className="my-1 h-px border-border-medium" />
            <Ariakit.MenuItem
              onClick={handleClear}
              className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-3.5 text-sm text-text-secondary outline-none hover:bg-surface-hover focus:bg-surface-hover md:px-2.5 md:py-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>{localize('com_ui_period_clear')}</span>
            </Ariakit.MenuItem>
          </>
        )}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
};

export default React.memo(FilterDropdown);
