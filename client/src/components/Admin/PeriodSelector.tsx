import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown } from '@librechat/client';
import type { AnalyticsPeriod } from 'librechat-data-provider';
import { useAdminPeriodsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

/** Localized "Month YYYY" label (UTC), e.g. "Mai 2026" / "May 2026". */
function formatMonthLocalized(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Period dropdown for the Analytics tab: "Current month" + "Overall" fixed at the top,
 * then the months with activity (from useAdminPeriodsQuery), labels localized via Intl.
 */
function PeriodSelector({
  value,
  onChange,
}: {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
}) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const { data } = useAdminPeriodsQuery();

  const options = useMemo<AnalyticsPeriod[]>(() => {
    const now = new Date();
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const head: AnalyticsPeriod[] = [
      {
        key: 'current-month',
        label: localize('com_usage_period_current_month'),
        start: null,
        end: null,
      },
      { key: 'overall', label: localize('com_usage_period_overall'), start: null, end: null },
    ];

    const months: AnalyticsPeriod[] = (data?.periods ?? [])
      .filter((p) => /^\d{4}-\d{2}$/.test(p.key) && p.key !== currentKey)
      .map((p) => {
        const [year, month] = p.key.split('-').map(Number);
        const nextMonth = new Date(Date.UTC(year, month, 1));
        const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
        return {
          key: p.key,
          label: formatMonthLocalized(year, month, i18n.language),
          start: `${p.key}-01`,
          end,
        };
      });

    return [...head, ...months];
  }, [data?.periods, localize, i18n.language]);

  const handleChange = (key: string) => {
    const selected = options.find((option) => option.key === key);
    if (selected) {
      onChange(selected);
    }
  };

  return (
    <Dropdown
      value={value.key}
      options={options.map((option) => ({ value: option.key, label: option.label }))}
      onChange={handleChange}
      sizeClasses="min-w-[180px]"
      aria-label={localize('com_usage_period_selector_label')}
    />
  );
}

export default PeriodSelector;
