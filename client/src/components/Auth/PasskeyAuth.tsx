import React, { useState } from 'react';
import { useLocalize } from '~/hooks';

type PasskeyAuthProps = {
  mode: 'login' | 'register';
  onBack?: () => void;
};

const PasskeyAuth: React.FC<PasskeyAuthProps> = ({ mode, onBack }) => {
  const localize = useLocalize();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchWithError = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Network request failed');
    }
    return response.json();
  };

  const base64URLToArrayBuffer = (base64url: string): ArrayBuffer => {
    const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
  };

  const arrayBufferToBase64URL = (buffer: ArrayBuffer): string => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  /**
   * Passkey Login Flow
   */
  const handlePasskeyLogin = async () => {
    if (!email) {
      alert('Email is required for login.');
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch login challenge
      const options = await fetchWithError(
        `/webauthn/login?email=${encodeURIComponent(email)}`,
        { method: 'GET' },
      );

      // 2. Convert challenge & credential IDs
      options.challenge = base64URLToArrayBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: base64URLToArrayBuffer(cred.id),
        }));
      }

      // 3. Request credential
      const credential = await navigator.credentials.create({ publicKey: options });

      if (!credential) {
        new Error('Failed to obtain credential');
      }

      // 4. Build credential object
      const { id, rawId, response, type } = credential;
      const authResponse = {
        id,
        rawId: arrayBufferToBase64URL(rawId),
        type,
        response: {
          authenticatorData: arrayBufferToBase64URL(
            (response as AuthenticatorAssertionResponse).authenticatorData
          ),
          clientDataJSON: arrayBufferToBase64URL(
            (response as AuthenticatorAssertionResponse).clientDataJSON
          ),
          signature: arrayBufferToBase64URL(
            (response as AuthenticatorAssertionResponse).signature
          ),
          userHandle: (response as AuthenticatorAssertionResponse).userHandle
            ? arrayBufferToBase64URL(
              (response as AuthenticatorAssertionResponse).userHandle!
            )
            : null,
        },
      };

      // 5. Send credential to server for verification
      const result = await fetchWithError('/webauthn/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential: authResponse }),
      });

      if (result?.user) {
        window.location.href = '/';
      } else {
        new Error(result?.error || 'Authentication failed');
      }
    } catch (error: any) {
      console.error('Passkey login error:', error);
      alert('Authentication failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Passkey Registration Flow
   */
  const handlePasskeyRegister = async () => {
    if (!email) {
      alert('Email is required for registration.');
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch registration challenge
      const options = await fetchWithError(
        `/webauthn/register?email=${encodeURIComponent(email)}`,
        { method: 'GET' },
      );

      // 2. Convert challenge & credential IDs
      options.challenge = base64URLToArrayBuffer(options.challenge);
      options.user.id = base64URLToArrayBuffer(options.user.id);
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((cred: any) => ({
          ...cred,
          id: base64URLToArrayBuffer(cred.id),
        }));
      }

      // 3. Request credential creation
      const credential = await navigator.credentials.create({ publicKey: options });

      if (!credential) {
        new Error('Failed to create credential');
      }

      // 4. Build registration object
      const { id, rawId, response, type } = credential;
      const registrationResponse = {
        id,
        rawId: arrayBufferToBase64URL(rawId),
        type,
        response: {
          clientDataJSON: arrayBufferToBase64URL(
            (response as AuthenticatorAttestationResponse).clientDataJSON
          ),
          attestationObject: arrayBufferToBase64URL(
            (response as AuthenticatorAttestationResponse).attestationObject
          ),
        },
      };

      // 5. Send credential to server for verification
      const result = await fetchWithError('/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential: registrationResponse }),
      });

      if (result?.user) {
        window.location.href = '/login';
      } else {
        new Error(result?.error || 'Registration failed');
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      alert('Registration failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await handlePasskeyLogin();
    } else {
      await handlePasskeyRegister();
    }
  };

  return (
    <div className="mt-6">
      <form onSubmit={handleSubmit}>
        <div className="relative mb-4">
          <input
            type="email"
            id="passkey-email"
            autoComplete="email"
            aria-label={localize('com_auth_email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="
              webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light
              bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none
            "
            placeholder=" "
          />
          <label
            htmlFor="passkey-email"
            className="
              absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform
              bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200
              peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4
              peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600
            "
          >
            {localize('com_auth_email_address')}
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="
            w-full rounded-2xl bg-green-600 px-4 py-3 text-sm
            font-medium text-white transition-colors hover:bg-green-700
            focus:outline-none focus:ring-2 focus:ring-green-500
            focus:ring-offset-2 disabled:opacity-50
          "
        >
          {loading
            ? localize('com_auth_loading')
            : localize(
              mode === 'login'
                ? 'com_auth_passkey_login'
                : 'com_auth_passkey_register'
            )}
        </button>
      </form>

      {onBack && (
        <div className="mt-4 text-center">
          <button
            onClick={onBack}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            {localize(
              mode === 'login'
                ? 'com_auth_back_to_login'
                : 'com_auth_back_to_register'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PasskeyAuth;