export const SHARE_EXPIRY = {
  ONE_HOUR: {
    label: 'com_ui_expiry_hour',
    value: 60 * 60 * 1000, // 1 hour in ms
    hours: 1,
  },
  TWELVE_HOURS: {
    label: 'com_ui_expiry_12_hours',
    value: 12 * 60 * 60 * 1000,
    hours: 12,
  },
  ONE_DAY: {
    label: 'com_ui_expiry_day',
    value: 24 * 60 * 60 * 1000,
    hours: 24,
  },
  SEVEN_DAYS: {
    label: 'com_ui_expiry_week',
    value: 7 * 24 * 60 * 60 * 1000,
    hours: 168,
  },
  THIRTY_DAYS: {
    label: 'com_ui_expiry_month',
    value: 30 * 24 * 60 * 60 * 1000,
    hours: 720,
  },
  NEVER: {
    label: 'com_ui_never',
    value: 0,
    hours: 0,
  },
} as const;
