import { createStore } from 'jotai';
import type { TPreset } from 'librechat-data-provider';
import { presetFamily, optionSettingsFamily } from '../index';

describe('pane families', () => {
  it('start empty for every pane', () => {
    const store = createStore();
    expect(store.get(presetFamily(0))).toBeNull();
    expect(store.get(optionSettingsFamily(0))).toEqual({});
  });

  it('keep each pane independent', () => {
    const store = createStore();
    store.set(presetFamily(0), { title: 'first' } as TPreset);
    store.set(optionSettingsFamily(0), { showExamples: true });

    expect(store.get(presetFamily(1))).toBeNull();
    expect(store.get(optionSettingsFamily(1))).toEqual({});
    expect(store.get(presetFamily(0))?.title).toBe('first');
    expect(store.get(optionSettingsFamily(0)).showExamples).toBe(true);
  });
});
