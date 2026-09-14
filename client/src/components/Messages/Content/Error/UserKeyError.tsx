import { useState } from 'react';
import { ErrorTypes, getEndpointField } from 'librechat-data-provider';
import type { ErrorRendererProps } from './parts';
import type { TranslationKeys } from '~/hooks';
import {
  ErrorBody,
  readString,
  ErrorAction,
  ErrorActions,
  formatTimestamp,
  useErrorEndpoint,
  ProviderErrorCodes,
} from './parts';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useLocalize } from '~/hooks';

type UserKeyErrorCode =
  | ErrorTypes.NO_USER_KEY
  | ErrorTypes.EXPIRED_USER_KEY
  | ErrorTypes.INVALID_USER_KEY
  | (typeof ProviderErrorCodes)[keyof typeof ProviderErrorCodes];

export default function UserKeyError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const [dialogOpen, setDialogOpen] = useState(false);
  const code = (readString(json, 'code') ?? readString(json, 'type')) as
    | UserKeyErrorCode
    | undefined;
  /** An expired key's payload names the endpoint whose key expired, which outranks the row's. */
  const payloadEndpoint =
    code === ErrorTypes.EXPIRED_USER_KEY ? readString(json, 'endpoint') : undefined;
  const { endpoint, endpointType, provider, userProvidesKey, endpointsConfig } = useErrorEndpoint(
    message,
    payloadEndpoint,
  );
  const expiredAt = readString(json, 'expiredAt');

  /**
   * Every one of these codes reads three ways: the endpoint is unknown (shared views), the reader
   * owns the key and can fix it, or the deployment owns it and only an administrator can.
   */
  const byOwnership = (
    generic: TranslationKeys,
    userProvided: TranslationKeys,
    admin: TranslationKeys,
  ): string => {
    if (provider == null) {
      return localize(generic);
    }
    return localize(userProvidesKey ? userProvided : admin, { 0: provider });
  };

  let errorMessage: string;
  switch (code) {
    case ErrorTypes.NO_USER_KEY:
      errorMessage = byOwnership(
        'com_error_no_user_key_generic',
        'com_error_no_user_key',
        'com_error_no_user_key_admin',
      );
      break;
    case ErrorTypes.EXPIRED_USER_KEY:
      if (expiredAt == null) {
        errorMessage = localize('com_error_invalid_user_key');
      } else if (provider == null) {
        errorMessage = localize('com_error_expired_user_key_generic', {
          0: formatTimestamp(expiredAt),
        });
      } else {
        errorMessage = localize('com_error_expired_user_key', {
          0: provider,
          1: formatTimestamp(expiredAt),
        });
      }
      break;
    case ErrorTypes.INVALID_USER_KEY:
      /** Only a key the user stored can fail to parse, so there is no administrator variant. */
      errorMessage =
        userProvidesKey && provider != null
          ? localize('com_error_invalid_user_key_provider', { 0: provider })
          : localize('com_error_invalid_user_key');
      break;
    case ProviderErrorCodes.INVALID_API_KEY:
      errorMessage = byOwnership(
        'com_error_invalid_api_key_generic',
        'com_error_invalid_api_key',
        'com_error_invalid_api_key_admin',
      );
      break;
    case ProviderErrorCodes.INSUFFICIENT_QUOTA:
      errorMessage = byOwnership(
        'com_error_insufficient_quota_generic',
        'com_error_insufficient_quota',
        'com_error_insufficient_quota_admin',
      );
      break;
    default:
      errorMessage = localize('com_error_invalid_user_key');
  }

  const canEditKey = userProvidesKey && endpoint != null;
  const updateLabel =
    code === ErrorTypes.NO_USER_KEY ? 'com_error_user_key_add' : 'com_error_user_key_update';

  return (
    <ErrorBody>
      {errorMessage}
      {canEditKey && (
        <ErrorActions>
          <ErrorAction onClick={() => setDialogOpen(true)}>{localize(updateLabel)}</ErrorAction>
        </ErrorActions>
      )}
      {canEditKey && dialogOpen && endpoint != null && (
        <SetKeyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          endpoint={endpoint}
          endpointType={endpointType}
          userProvideURL={getEndpointField(endpointsConfig, endpoint, 'userProvideURL')}
          userProvideAccessKeyId={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideAccessKeyId',
          )}
          userProvideSecretAccessKey={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideSecretAccessKey',
          )}
          userProvideSessionToken={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideSessionToken',
          )}
          userProvideBearerToken={getEndpointField(
            endpointsConfig,
            endpoint,
            'userProvideBearerToken',
          )}
        />
      )}
    </ErrorBody>
  );
}
