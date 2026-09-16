import { createContext, useContext } from 'react';
import type { MediaAsset } from 'librechat-data-provider';
import type { ComposerProps } from '@librechat/client';
import type { ReactNode } from 'react';

export type MediaHost = {
  scope: string;
  canCreate: boolean;
  pollIntervalMs: number;
  catchUpIntervalMs: number;
  enterToSend: boolean;
  resolveKeyVerdict?: ComposerProps['resolveKeyVerdict'];
  isCurrentSession: () => boolean;
  useInChat?: (asset: MediaAsset) => Promise<void>;
  openThread: (threadId: string) => void;
};
const Context = createContext<MediaHost | null>(null);
export function MediaHostProvider({ value, children }: { value: MediaHost; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMediaHost() {
  const host = useContext(Context);
  if (!host) throw new Error('MediaHostProvider is required');
  return host;
}
