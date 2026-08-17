import { useAtomValue } from 'jotai';
import { uiScaleValueAtom } from '~/store/uiScale';

/**
 * Keeps the scale atom mounted so Jotai's storage subscription stays active and a
 * change made in another tab reaches this one. Renders nothing, which confines the
 * re-render to this leaf instead of the provider tree, where the query client is
 * constructed during render.
 */
export default function UiScaleSync(): null {
  useAtomValue(uiScaleValueAtom);
  return null;
}
