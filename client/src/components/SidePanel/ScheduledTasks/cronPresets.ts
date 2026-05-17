export interface CronPreset {
  /** Localization key for the human label */
  labelKey: string;
  /** Fallback English label */
  label: string;
  /** Cron expression (5-field) */
  value: string;
}

/**
 * Common cron presets surfaced in the task builder. Power users can still
 * type any 5-field cron expression directly; this list is just a quick start.
 */
export const CRON_PRESETS: CronPreset[] = [
  { labelKey: 'com_sidepanel_cron_every_minute', label: 'Every minute', value: '* * * * *' },
  {
    labelKey: 'com_sidepanel_cron_every_5_minutes',
    label: 'Every 5 minutes',
    value: '*/5 * * * *',
  },
  {
    labelKey: 'com_sidepanel_cron_every_15_minutes',
    label: 'Every 15 minutes',
    value: '*/15 * * * *',
  },
  { labelKey: 'com_sidepanel_cron_hourly', label: 'Hourly (top of the hour)', value: '0 * * * *' },
  { labelKey: 'com_sidepanel_cron_daily_midnight', label: 'Daily at 00:00', value: '0 0 * * *' },
  { labelKey: 'com_sidepanel_cron_daily_9am', label: 'Daily at 09:00', value: '0 9 * * *' },
  {
    labelKey: 'com_sidepanel_cron_weekdays_9am',
    label: 'Weekdays at 09:00',
    value: '0 9 * * 1-5',
  },
  {
    labelKey: 'com_sidepanel_cron_monday_9am',
    label: 'Every Monday at 09:00',
    value: '0 9 * * 1',
  },
  {
    labelKey: 'com_sidepanel_cron_first_of_month',
    label: '1st of every month at 09:00',
    value: '0 9 1 * *',
  },
];

/**
 * Returns a friendly natural-language description for a few common cron
 * expressions. Returns null for anything we can't confidently describe so the
 * UI can fall back to showing the raw expression.
 */
export function describeCronExpression(expression: string): string | null {
  const preset = CRON_PRESETS.find((p) => p.value === expression);
  if (preset) {
    return preset.label;
  }

  const trimmed = expression.trim().split(/\s+/);
  if (trimmed.length !== 5) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = trimmed;

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '*' && hour === '*') {
      return 'Every minute';
    }
    if (hour === '*' && /^\*\/\d+$/.test(minute)) {
      return `Every ${minute.split('/')[1]} minutes`;
    }
    if (/^\d+$/.test(minute) && hour === '*') {
      return `Every hour at :${minute.padStart(2, '0')}`;
    }
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
      return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }

  return null;
}
