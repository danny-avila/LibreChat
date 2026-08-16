import { atom } from 'jotai';
import { applyUiScale, clampUiScale, DEFAULT_UI_SCALE } from '@librechat/client';
import { createStorageAtomWithEffect, initializeFromStorage } from './jotai-utils';

/**
 * This atom stores the user's interface scale preference.
 * Browser zoom (Ctrl -/+) is left untouched on purpose: it is an accessibility
 * affordance users rely on, and the two zoom levels would compound if intercepted.
 */
export const uiScaleAtom = createStorageAtomWithEffect<number>(
  'uiScale',
  DEFAULT_UI_SCALE,
  applyUiScale,
);

/**
 * Read-only, always-valid scale for layout that cannot be expressed in rem,
 * such as virtualized row heights and drag-resized panel widths.
 */
export const uiScaleValueAtom = atom((get) => clampUiScale(get(uiScaleAtom)));

/**
 * Initialize the interface scale on app load
 * This function applies the saved scale from localStorage to the DOM
 */
export const initializeUiScale = (): void => {
  initializeFromStorage('uiScale', DEFAULT_UI_SCALE, applyUiScale);
};
