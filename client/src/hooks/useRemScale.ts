import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { uiScaleValueAtom } from '~/store/uiScale';

const BASE_FONT_SIZE = 16;

const readRemScale = (): number => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 1;
  }
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize / BASE_FONT_SIZE : 1;
};

/**
 * Ratio between a rendered rem and the 16px baseline that pixel layout constants
 * assume. Reads the computed root font size rather than the stored preference, so
 * sizes stay correct for readers whose browser default is not 16px, where the UI
 * scale alone would understate the rendered size.
 */
export default function useRemScale(): number {
  const uiScale = useAtomValue(uiScaleValueAtom);
  const [applied, setApplied] = useState(() => ({ uiScale, remScale: readRemScale() }));

  if (applied.uiScale !== uiScale) {
    setApplied({ uiScale, remScale: readRemScale() });
  }

  return applied.remScale;
}
