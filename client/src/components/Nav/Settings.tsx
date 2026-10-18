import { lazy, Suspense, useEffect } from 'react';
import { atom, useAtom } from 'jotai';
import type { SettingsTab } from './Settings/types';

export const settingsOpenAtom = atom(false);

/** The tab the next opening of settings starts on (e.g. Organization, from the switcher). */
export const settingsInitialTabAtom = atom<SettingsTab | null>(null);

/** Keep settings lazy without tying its lifetime to a responsive account-menu trigger. */
const SettingsDialog = lazy(() => import('./Settings/Dialog'));

export default function Settings() {
  const [open, setOpen] = useAtom(settingsOpenAtom);

  useEffect(() => () => setOpen(false), [setOpen]);

  return open ? (
    <Suspense fallback={null}>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </Suspense>
  ) : null;
}
