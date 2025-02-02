import {
  GoogleIcon,
  FacebookIcon,
  OpenIDIcon,
  GithubIcon,
  DiscordIcon,
  PasskeyIcon,
} from '~/components';
import { useLocalize } from '~/hooks';
import SocialButton from './SocialButton';
import { TStartupConfig } from 'librechat-data-provider';
import React, { useState } from 'react';

// Utility functions for base64url conversion
function base64URLToArrayBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}
function arrayBufferToBase64URL(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface Props {
  startupConfig: TStartupConfig | null | undefined;
  mode: 'login' | 'register'; // decides which passkey flow to use
}

function SocialLoginRender({ startupConfig, mode }: Props) {
  const localize = useLocalize();
  // Use an email state for passkey flows in both login and register modes
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (!startupConfig) {
    return null;
  }

  /* ---------------------------------------
   * PASSKEY LOGIN FLOW
   * --------------------------------------- */
  async function handlePasskeyLogin() {
    if (!email) {
      return alert('Email is required for login.');
    }
    setLoading(true);
    try {
      // Step 1: Request a login challenge using a GET request
      const challengeResponse = await fetch(
        `/webauthn/login?email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!challengeResponse.ok) {
        const error = await challengeResponse.json();
        throw new Error(error.error || 'Failed to get challenge');
      }

      const options = await challengeResponse.json();

      // Convert challenge from base64url to ArrayBuffer
      options.challenge = base64URLToArrayBuffer(options.challenge);

      // If allowed credentials are provided, convert their id values
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((cred) => ({
          ...cred,
          id: base64URLToArrayBuffer(cred.id),
        }));
      }

      // Step 2: Request an assertion from the authenticator
      const credential = await navigator.credentials.get({ publicKey: options });
      if (!credential) {
        throw new Error('Failed to obtain credential');
      }

      // Prepare the credential data for the server
      const authenticationResponse = {
        id: credential.id,
        rawId: arrayBufferToBase64URL(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: arrayBufferToBase64URL(credential.response.authenticatorData),
          clientDataJSON: arrayBufferToBase64URL(credential.response.clientDataJSON),
          signature: arrayBufferToBase64URL(credential.response.signature),
          userHandle: credential.response.userHandle
            ? arrayBufferToBase64URL(credential.response.userHandle)
            : null,
        },
      };

      // Step 3: Send the credential to the server for verification via POST
      const loginCallbackResponse = await fetch('/webauthn/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential: authenticationResponse }),
      });

      const result = await loginCallbackResponse.json();
      if (result.user) {
        // Redirect to "/" after successful login.
        window.location.href = '/';
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error: any) {
      console.error('Passkey login error:', error);
      alert('Authentication failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------
   * PASSKEY SIGNUP FLOW
   * --------------------------------------- */
  async function handlePasskeyRegister() {
    if (!email) {
      return alert('Email is required for registration.');
    }
    setLoading(true);
    try {
      // Step 1: Request a registration challenge using a GET request
      const challengeResponse = await fetch(
        `/webauthn/register?email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!challengeResponse.ok) {
        const error = await challengeResponse.json();
        throw new Error(error.error || 'Failed to get challenge');
      }

      const options = await challengeResponse.json();
      console.log('Received challenge:', options.challenge);

      // Convert challenge and user.id from base64url to ArrayBuffer
      options.challenge = base64URLToArrayBuffer(options.challenge);
      options.user.id = base64URLToArrayBuffer(options.user.id);

      // Convert excludeCredentials ids if provided
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((cred) => ({
          ...cred,
          id: base64URLToArrayBuffer(cred.id),
        }));
      }

      // Step 2: Create a new credential via the authenticator
      const credential = await navigator.credentials.create({ publicKey: options });
      if (!credential) {
        throw new Error('Failed to create credential');
      }

      console.log('Credential created:', credential);

      // Prepare the credential data for sending to the server
      const registrationResponse = {
        id: credential.id,
        rawId: arrayBufferToBase64URL(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: arrayBufferToBase64URL(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64URL(credential.response.attestationObject),
        },
      };

      // Step 3: Send the credential to the server for verification via POST
      const registerCallbackResponse = await fetch('/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential: registrationResponse }),
      });

      const result = await registerCallbackResponse.json();
      if (result.user) {
        // Redirect to "/login" after successful registration.
        window.location.href = '/login';
      } else {
        throw new Error(result.error || 'Registration failed');
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      alert('Registration failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  // Depending on the mode, call the appropriate passkey flow
  function handlePasskey() {
    if (mode === 'register') {
      handlePasskeyRegister();
    } else {
      handlePasskeyLogin();
    }
  }

  /* --------------------------------------
   * Create Social Buttons
   * --------------------------------------*/
  const providerComponents = {
    discord: startupConfig.discordLoginEnabled ? (
      <SocialButton
        key="discord"
        enabled={startupConfig.discordLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="discord"
        Icon={DiscordIcon}
        label={localize('com_auth_discord_login')}
        id="discord"
      />
    ) : null,
    facebook: startupConfig.facebookLoginEnabled ? (
      <SocialButton
        key="facebook"
        enabled={startupConfig.facebookLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="facebook"
        Icon={FacebookIcon}
        label={localize('com_auth_facebook_login')}
        id="facebook"
      />
    ) : null,
    github: startupConfig.githubLoginEnabled ? (
      <SocialButton
        key="github"
        enabled={startupConfig.githubLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="github"
        Icon={GithubIcon}
        label={localize('com_auth_github_login')}
        id="github"
      />
    ) : null,
    google: startupConfig.googleLoginEnabled ? (
      <SocialButton
        key="google"
        enabled={startupConfig.googleLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="google"
        Icon={GoogleIcon}
        label={localize('com_auth_google_login')}
        id="google"
      />
    ) : null,
    passkeys: startupConfig.passkeyLoginEnabled ? (
      <SocialButton
        key="passkeys"
        id="passkeys"
        enabled={startupConfig.passkeyLoginEnabled}
        onClick={handlePasskey}
        Icon={PasskeyIcon}
        label={
          mode === 'register'
            ? localize('com_auth_passkey_signup') || 'Sign up with Passkey'
            : localize('com_auth_passkey_login') || 'Sign in with Passkey'
        }
      />
    ) : null,
    openid: startupConfig.openidLoginEnabled ? (
      <SocialButton
        key="openid"
        enabled={startupConfig.openidLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="openid"
        Icon={() =>
          startupConfig.openidImageUrl ? (
            <img
              src={startupConfig.openidImageUrl}
              alt="OpenID Logo"
              className="h-5 w-5"
            />
          ) : (
            <OpenIDIcon />
          )
        }
        label={startupConfig.openidLabel}
        id="openid"
      />
    ) : null,
  };

  return (
    startupConfig.socialLoginEnabled && (
      <>
        {startupConfig.emailLoginEnabled && (
          <div className="relative mt-6 flex w-full items-center justify-center border border-t border-gray-300 uppercase dark:border-gray-600">
            <div className="absolute bg-white px-3 text-xs text-black dark:bg-gray-900 dark:text-white">
              {localize('com_auth_or')}
            </div>
          </div>
        )}

        {/* Render an email input form if passkey login is enabled.
            This input is used for both login and registration flows. */}
        {startupConfig.passkeyLoginEnabled && (
          <div className="mt-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              {localize('com_auth_email') || 'Email'}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>
        )}

        <div className="mt-2 flex flex-col space-y-2">
          {startupConfig.socialLogins?.map(
            (provider) => providerComponents[provider] || null,
          )}
        </div>
      </>
    )
  );
}

export default SocialLoginRender;