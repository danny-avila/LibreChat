import { useState } from 'react';
import { ErrorTypes, alternateName, getEndpointField } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import type { ErrorRendererProps } from './parts';
import {
  ErrorAction,
  ErrorActions,
  ErrorBody,
  formatTimestamp,
  readString,
  useErrorEndpoint,
} from './parts';

const providerErrorCodes = {
  INVALID_API_KEY: 'invalid_api_key',
  INSUFFICIENT_QUOTA: 'insufficient_quota',
} as const;

type UserKeyErrorCode =
  | ErrorTypes.NO_USER_KEY
  | ErrorTypes.EXPIRED_USER_KEY
  | (typeof providerErrorCodes)[keyof typeof providerErrorCodes];

export default function UserKeyError({ json, message }: ErrorRendererProps) {
  const localize = useLocalize();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { endpoint, endpointType, provider, userProvidesKey, endpointsConfig } =
    useErrorEndpoint(message);
  const errorKey = readString(json, 'code') ?? readString(json, 'type');
  const payloadEndpoint = readString(json, 'endpoint');
  const displayProvider =
    provider ??
    (errorKey === ErrorTypes.EXPIRED_USER_KEY && payloadEndpoint != null
      ? ((alternateName[payloadEndpoint] as string | undefined) ?? payloadEndpoint)
      : undefined);
  const code = errorKey as UserKeyErrorCode | undefined;
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
    if (displayProvider == null) {
      return localize(generic);
    }
    return localize(userProvidesKey ? userProvided : admin, { 0: displayProvider });
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
      } else if (displayProvider == null) {
        errorMessage = localize('com_error_expired_user_key_generic', {
          0: formatTimestamp(expiredAt),
        });
      } else {
        errorMessage = localize('com_error_expired_user_key', {
          0: displayProvider,
          1: formatTimestamp(expiredAt),
        });
      }
      break;
    case providerErrorCodes.INVALID_API_KEY:
      errorMessage = byOwnership(
        'com_error_invalid_api_key_generic',
        'com_error_invalid_api_key',
        'com_error_invalid_api_key_admin',
      );
      break;
    case providerErrorCodes.INSUFFICIENT_QUOTA:
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
