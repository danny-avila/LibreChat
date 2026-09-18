import { atom, getDefaultStore } from 'jotai';
import type { MediaAsset, TUser } from 'librechat-data-provider';
import { registerSessionCleanup } from '~/store/session';
export const mediaSessionScope = (user: Pick<TUser, 'id' | 'tenantId'>) =>
  JSON.stringify([user.tenantId ?? '', user.id]);
export const mediaChatHandoff = atom<{
  scope: string;
  conversationId: string;
  asset: MediaAsset;
} | null>(null);
registerSessionCleanup(() => getDefaultStore().set(mediaChatHandoff, null));
