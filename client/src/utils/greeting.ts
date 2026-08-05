import type { TranslationKeys } from '~/hooks/useLocalize';

export type GreetingSlot = {
  until: number;
  key: TranslationKeys;
  namedKey?: TranslationKeys;
};

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export const dayKeys: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const defaultGreetingSlots: GreetingSlot[] = [
  { until: 5, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
  { until: 12, key: 'com_ui_greeting_welcome', namedKey: 'com_ui_greeting_welcome_named' },
  { until: 17, key: 'com_ui_greeting_day_going', namedKey: 'com_ui_greeting_day_going_named' },
  {
    until: 22,
    key: 'com_ui_greeting_winding_down',
    namedKey: 'com_ui_greeting_winding_down_named',
  },
  { until: 24, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
];

export const greetingSlotsByDay: Partial<Record<DayKey, GreetingSlot[]>> = {
  sun: [
    {
      until: 5,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
    { until: 12, key: 'com_ui_greeting_cooking', namedKey: 'com_ui_greeting_cooking_named' },
    {
      until: 17,
      key: 'com_ui_greeting_good_afternoon',
      namedKey: 'com_ui_greeting_good_afternoon_named',
    },
    { until: 22, key: 'com_ui_greeting_returns', namedKey: 'com_ui_greeting_returns_named' },
    {
      until: 24,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
  ],

  mon: [
    {
      until: 5,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
    { until: 12, key: 'com_ui_greeting_new_week', namedKey: 'com_ui_greeting_new_week_named' },
    { until: 17, key: 'com_ui_greeting_back_at_it', namedKey: 'com_ui_greeting_back_at_it_named' },
    {
      until: 22,
      key: 'com_ui_greeting_evening_shift',
      namedKey: 'com_ui_greeting_evening_shift_named',
    },
    {
      until: 24,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
  ],

  wed: [
    {
      until: 5,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
    { until: 12, key: 'com_ui_greeting_early_bird', namedKey: 'com_ui_greeting_early_bird_named' },
    { until: 17, key: 'com_ui_greeting_working_on', namedKey: 'com_ui_greeting_working_on_named' },
    { until: 22, key: 'com_ui_greeting_returns', namedKey: 'com_ui_greeting_returns_named' },
    {
      until: 24,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
  ],

  thu: [
    { until: 5, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
    {
      until: 12,
      key: 'com_ui_greeting_happy_thursday',
      namedKey: 'com_ui_greeting_happy_thursday_named',
    },
    {
      until: 17,
      key: 'com_ui_greeting_good_afternoon',
      namedKey: 'com_ui_greeting_good_afternoon_named',
    },
    {
      until: 22,
      key: 'com_ui_greeting_good_evening',
      namedKey: 'com_ui_greeting_good_evening_named',
    },
    { until: 24, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
  ],

  fri: [
    {
      until: 5,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
    {
      until: 12,
      key: 'com_ui_greeting_good_morning',
      namedKey: 'com_ui_greeting_good_morning_named',
    },
    { until: 17, key: 'com_ui_greeting_day_going', namedKey: 'com_ui_greeting_day_going_named' },
    {
      until: 22,
      key: 'com_ui_greeting_evening_shift',
      namedKey: 'com_ui_greeting_evening_shift_named',
    },
    {
      until: 24,
      key: 'com_ui_greeting_think_through',
      namedKey: 'com_ui_greeting_think_through_named',
    },
  ],

  sat: [
    { until: 5, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
    { until: 12, key: 'com_ui_greeting_coffee', namedKey: 'com_ui_greeting_coffee_named' },
    { until: 17, key: 'com_ui_greeting_tackle', namedKey: 'com_ui_greeting_tackle_named' },
    {
      until: 22,
      key: 'com_ui_greeting_winding_down',
      namedKey: 'com_ui_greeting_winding_down_named',
    },
    { until: 24, key: 'com_ui_greeting_up_late', namedKey: 'com_ui_greeting_up_late_named' },
  ],
};

const getSlots = (date: Date): GreetingSlot[] =>
  greetingSlotsByDay[dayKeys[date.getDay()]] ?? defaultGreetingSlots;

/** Slot for the given local date/time, from the day's schedule or the default one. */
export const getGreetingSlot = (date: Date = new Date()): GreetingSlot => {
  const slots = getSlots(date);
  const hours = date.getHours();
  return slots.find((slot) => hours < slot.until) ?? slots[slots.length - 1];
};

/** Translation key for the greeting, preferring the personalized variant when named. */
export const getGreetingKey = (date: Date = new Date(), hasName = false): TranslationKeys => {
  const slot = getGreetingSlot(date);
  return hasName ? (slot.namedKey ?? slot.key) : slot.key;
};

/** Milliseconds from `date` until the current greeting slot expires (local time). */
export const getMsUntilNextGreeting = (date: Date = new Date()): number => {
  const boundary = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    getGreetingSlot(date).until,
    0,
    0,
    0,
  );
  return boundary.getTime() - date.getTime();
};
