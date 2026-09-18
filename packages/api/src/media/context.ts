import type { AppConfig, IUser, MediaOwnerScope } from '@librechat/data-schemas';
import type { MediaConfig } from 'librechat-data-provider';

export interface MediaContext {
  scope: MediaOwnerScope;
  appConfig: AppConfig;
  config: MediaConfig;
  canUse: boolean;
  canCreate: boolean;
  /** Present only on the HTTP path; provider credential resolution for generated titles needs it. */
  user?: IUser;
}
