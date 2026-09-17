import type { AppConfig, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaConfig } from 'librechat-data-provider';

export interface MediaContext {
  scope: MediaOwnerScope;
  appConfig: AppConfig;
  config: MediaConfig;
  canUse: boolean;
  canCreate: boolean;
}
