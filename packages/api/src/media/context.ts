import type { AppConfig, MediaOwnerScope } from '@librechat/data-schemas';
import type { FileStorage, MediaConfig } from 'librechat-data-provider';
import type { SafeUserInput } from '~/utils/env';

export interface MediaContext {
  scope: MediaOwnerScope;
  appConfig: AppConfig;
  config: MediaConfig;
  canUse: boolean;
  canCreate: boolean;
  storageSources?: readonly FileStorage[];
  storageReady?: boolean;
  /** Loaded identity fields reused by provider configuration and title generation. */
  user?: SafeUserInput & { id: string };
  /** HTTP admission callbacks are omitted for worker reconciliation. */
  admitGeneration?(): Promise<void>;
  admitImport?(): Promise<void>;
}
