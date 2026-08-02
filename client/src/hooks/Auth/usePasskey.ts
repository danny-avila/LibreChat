import { useCallback, useEffect, useRef, useState } from 'react';
import { dataService } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type {
  TPasskey,
  TPasskeyAuthenticationResponse,
  TPasskeyRegistrationResponse,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';

import { useRegisterPasskeyMutation } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';

/** Thrown by the browser when the user dismisses or times out the native prompt. */
const isDismissal = (error: unknown): boolean => {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
};

/** Maps a WebAuthn ceremony failure onto a message the user can act on. */
const ceremonyErrorKey = (error: unknown): TranslationKeys => {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'InvalidStateError') {
    return 'com_auth_passkey_already_registered';
  }
  if (name === 'SecurityError') {
    return 'com_auth_passkey_origin_error';
  }
  return 'com_auth_passkey_error';
};

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

/**
 * Drives the passkey sign-in ceremony.
 *
 * `signIn` runs the modal ceremony from an explicit user action. Separately, if
 * the browser supports conditional mediation, an autofill ceremony is started
 * once on mount so a passkey is offered inline from the login form's email
 * field. Both paths finish with a full navigation, matching the 2FA screen.
 */
export function usePasskeySignIn({ enabled }: { enabled: boolean }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isSigningIn, setIsSigningIn] = useState(false);
  /** Guards against a second autofill ceremony on React 18 double-invoked effects. */
  const autofillStarted = useRef(false);

  const complete = useCallback(
    async (credential: TPasskeyAuthenticationResponse, sessionId: string) => {
      const result = await dataService.verifyPasskeyLogin({ credential, sessionId });
      if (result.twoFAPending === true && result.tempToken != null) {
        window.location.href = `/login/2fa?tempToken=${encodeURIComponent(result.tempToken)}`;
        return;
      }
      window.location.href = '/';
    },
    [],
  );

  const signIn = useCallback(async () => {
    if (!enabled || isSigningIn) {
      return;
    }
    if (!browserSupportsWebAuthn()) {
      showToast({ message: localize('com_auth_passkey_not_supported'), status: 'error' });
      return;
    }

    setIsSigningIn(true);
    try {
      const { options, sessionId } = await dataService.getPasskeyLoginOptions();
      const credential = (await startAuthentication({
        optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
      })) as TPasskeyAuthenticationResponse;
      await complete(credential, sessionId);
    } catch (error) {
      setIsSigningIn(false);
      if (isDismissal(error)) {
        return;
      }
      showToast({ message: localize(ceremonyErrorKey(error)), status: 'error' });
    }
  }, [enabled, isSigningIn, complete, localize, showToast]);

  useEffect(() => {
    if (!enabled || autofillStarted.current) {
      return;
    }
    autofillStarted.current = true;

    let cancelled = false;
    const startAutofill = async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) {
          return;
        }
        const { options, sessionId } = await dataService.getPasskeyLoginOptions();
        const credential = (await startAuthentication({
          optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
          useBrowserAutofill: true,
        })) as TPasskeyAuthenticationResponse;
        if (cancelled) {
          return;
        }
        setIsSigningIn(true);
        await complete(credential, sessionId);
      } catch {
        /** Autofill is a progressive enhancement: a failure leaves the form usable. */
      }
    };

    void startAutofill();
    return () => {
      cancelled = true;
    };
  }, [enabled, complete]);

  return { signIn, isSigningIn };
}

/**
 * Drives passkey enrollment for the signed-in user. Resolves to the stored
 * credential so callers can put it straight into rename mode, or `null` when
 * the ceremony was dismissed or failed.
 */
export function usePasskeyRegistration() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isRegistering, setIsRegistering] = useState(false);
  const { mutateAsync: verifyRegistration } = useRegisterPasskeyMutation();

  const registerPasskey = useCallback(async (): Promise<TPasskey | null> => {
    if (!browserSupportsWebAuthn()) {
      showToast({ message: localize('com_auth_passkey_not_supported'), status: 'error' });
      return null;
    }

    setIsRegistering(true);
    try {
      const options = await dataService.getPasskeyRegistrationOptions();
      const credential = (await startRegistration({
        optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
      })) as TPasskeyRegistrationResponse;
      const { passkey } = await verifyRegistration({ credential });
      showToast({ message: localize('com_ui_passkey_added'), status: 'success' });
      return passkey;
    } catch (error) {
      if (!isDismissal(error)) {
        showToast({ message: localize(ceremonyErrorKey(error)), status: 'error' });
      }
      return null;
    } finally {
      setIsRegistering(false);
    }
  }, [verifyRegistration, localize, showToast]);

  return { registerPasskey, isRegistering };
}
