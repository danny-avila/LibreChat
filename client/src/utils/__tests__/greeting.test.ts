import {
  dayKeys,
  getGreetingKey,
  getGreetingSlot,
  greetingSlotsByDay,
  defaultGreetingSlots,
  getMsUntilNextGreeting,
} from '../greeting';
import translationEn from '~/locales/en/translation.json';

/** 2024-01-07 is a Sunday, so index 0..6 maps directly onto sun..sat. */
const dateForDay = (dayIndex: number, hours: number, minutes = 0, seconds = 0) =>
  new Date(2024, 0, 7 + dayIndex, hours, minutes, seconds, 0);

const slotsFor = (dayIndex: number) =>
  greetingSlotsByDay[dayKeys[dayIndex]] ?? defaultGreetingSlots;

describe('greeting schedule', () => {
  it('references translation keys that exist in the English catalog', () => {
    [defaultGreetingSlots, ...Object.values(greetingSlotsByDay)].forEach((slots) => {
      slots?.forEach((slot) => {
        expect(translationEn).toHaveProperty(slot.key);
        expect(translationEn).toHaveProperty(slot.namedKey ?? '');
      });
    });
  });

  /** Every slot must greet a signed-in user by name, at every hour of every day. */
  it('offers a personalized variant for every slot', () => {
    [defaultGreetingSlots, ...Object.values(greetingSlotsByDay)].forEach((slots) => {
      slots?.forEach((slot) => {
        expect(slot.namedKey).toBeDefined();
        expect(translationEn[slot.namedKey as keyof typeof translationEn]).toContain('{{name}}');
      });
    });
  });

  it('never interpolates a name into the anonymous variants', () => {
    [defaultGreetingSlots, ...Object.values(greetingSlotsByDay)].forEach((slots) => {
      slots?.forEach((slot) => {
        expect(translationEn[slot.key]).not.toContain('{{name}}');
      });
    });
  });
});

describe('getGreetingSlot', () => {
  it('maps each weekday to its own schedule', () => {
    dayKeys.forEach((_key, index) => {
      expect(dateForDay(index, 12).getDay()).toBe(index);
      expect(getGreetingSlot(dateForDay(index, 12))).toBe(slotsFor(index)[2]);
    });
  });

  it('falls back to the default schedule on Tuesday', () => {
    expect(greetingSlotsByDay.tue).toBeUndefined();
    expect(dateForDay(2, 9).getDay()).toBe(2);
    defaultGreetingSlots.forEach((slot, index) => {
      const hour = index === 0 ? 0 : defaultGreetingSlots[index - 1].until;
      expect(getGreetingSlot(dateForDay(2, hour))).toBe(slot);
    });
  });

  it('selects the first slot whose `until` exceeds the hour, for every boundary', () => {
    dayKeys.forEach((_key, dayIndex) => {
      slotsFor(dayIndex).forEach((slot, slotIndex) => {
        const slots = slotsFor(dayIndex);
        const start = slotIndex === 0 ? 0 : slots[slotIndex - 1].until;
        expect(getGreetingSlot(dateForDay(dayIndex, start))).toBe(slot);
        expect(getGreetingSlot(dateForDay(dayIndex, slot.until - 1, 59, 59))).toBe(slot);
      });
    });
  });

  it.each([
    [0, 0],
    [4, 0],
    [5, 1],
    [11, 1],
    [12, 2],
    [16, 2],
    [17, 3],
    [21, 3],
    [22, 4],
    [23, 4],
  ])('resolves hour %i to slot index %i on every day', (hour, slotIndex) => {
    dayKeys.forEach((_key, dayIndex) => {
      expect(getGreetingSlot(dateForDay(dayIndex, hour))).toBe(slotsFor(dayIndex)[slotIndex]);
    });
  });
});

describe('getGreetingKey', () => {
  it('uses the personalized key only when a name is available', () => {
    const wednesdayEvening = dateForDay(3, 20);
    expect(getGreetingKey(wednesdayEvening, true)).toBe('com_ui_greeting_returns_named');
    expect(getGreetingKey(wednesdayEvening, false)).toBe('com_ui_greeting_returns');
  });

  it('resolves a personalized key at every hour of every day', () => {
    dayKeys.forEach((_key, dayIndex) => {
      for (let hour = 0; hour < 24; hour++) {
        const key = getGreetingKey(dateForDay(dayIndex, hour), true);
        expect(translationEn[key as keyof typeof translationEn]).toContain('{{name}}');
      }
    });
  });
});

describe('getMsUntilNextGreeting', () => {
  it('counts down to the end of the active slot', () => {
    expect(getMsUntilNextGreeting(dateForDay(2, 4, 59, 0))).toBe(60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 11, 30, 0))).toBe(30 * 60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 16, 0, 0))).toBe(60 * 60 * 1000);
    expect(getMsUntilNextGreeting(dateForDay(2, 21, 0, 0))).toBe(60 * 60 * 1000);
  });

  it('rolls over to local midnight for the final slot', () => {
    expect(getMsUntilNextGreeting(dateForDay(2, 23, 0, 0))).toBe(60 * 60 * 1000);
  });
});
