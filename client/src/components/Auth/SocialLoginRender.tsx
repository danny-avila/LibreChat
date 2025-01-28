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
import { encode, decode } from '~/utils/encoding';
import React, { useState } from 'react';

interface Props {
  startupConfig: TStartupConfig | null | undefined;
  mode: 'login' | 'register'; // decide passkey action
}

function SocialLoginRender({ startupConfig, mode }: Props) {
  const localize = useLocalize();
  const [email, setEmail] = useState(''); // **State for Email**
  const [loading, setLoading] = useState(false); // **State for Loading**

  if (!startupConfig) {
    return null;
  }

  async function handleFetch(url, options) {
    const response = await fetch(url, options);

    // Dynamically check the Content-Type header to decide how to parse the response
    const contentType = response.headers.get('Content-Type') || '';

    if (!response.ok) {
      // Parse error message based on Content-Type
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'An error occurred.');
      } else {
        const errorText = await response.text();
        throw new Error(errorText || 'An error occurred.');
      }
    }

    // Handle valid responses
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text(); // Fallback for non-JSON responses
  }

  /* ---------------------------------------
   * PASSKEY LOGIN FLOW
   * --------------------------------------- */
  async function handlePasskeyLogin() {
    setLoading(true);
    try {
      // Step 1: Request challenge from server
      const data = await handleFetch('/api/auth/passkey/login/public-key/challenge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const challengeBuffer = decode(data.challenge);

      // Step 2: Request assertion from authenticator
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBuffer,
          allowCredentials: [], // Optionally specify allowed credentials
          timeout: 60000, // Timeout in milliseconds
          userVerification: 'preferred',
        },
      });

      if (!assertion) {
        throw new Error('No credential returned from WebAuthn API.');
      }

      // Step 3: Prepare credential data for submission
      const credentialData = {
        id: assertion.id,
        type: assertion.type,
        rawId: encode(assertion.rawId),
        response: {
          clientDataJSON: encode(assertion.response.clientDataJSON),
          authenticatorData: encode(assertion.response.authenticatorData),
          signature: encode(assertion.response.signature),
          userHandle: assertion.response.userHandle ? encode(assertion.response.userHandle) : null,
        },
      };

      // Step 4: Submit credential to the server
      const submitRes = await handleFetch('/api/auth/passkey/login/public-key', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(credentialData),
      });

      // Handle redirection
      if (submitRes.redirected) {
        window.location.href = submitRes.url;
      } else {
        // Handle successful login without redirection
        window.location.href = startupConfig?.serverDomain;
      }
    } catch (err) {
      console.error('Passkey login error:', err);
      alert(err?.message || 'Passkey login error');
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------------------
   * PASSKEY SIGNUP FLOW
   * --------------------------------------- */
  async function handlePasskeyRegister() {
    setLoading(true);

    try {
      if (!email) {
        throw new Error('Email is required for signup.');
      }

      // Step 1: Request challenge from server
      const json = await handleFetch('/api/auth/passkey/signup/public-key/challenge', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      // Step 2: Create credential
      const credential = await navigator.credentials.create({
        publicKey: {
          rp: {
            name: 'LibreChat', // Replace with your app name
            id: startupConfig?.serverDomain,
          },
          user: {
            id: decode(json.user.id),
            name: json.user.name,
            displayName: json.user.displayName,
          },
          challenge: decode(json.challenge),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            userVerification: 'preferred',
          },
          attestation: 'none',
        },
      });

      if (!credential) {
        throw new Error('No credential returned from WebAuthn API.');
      }

      // Step 3: Prepare credential data for submission
      const credentialData = {
        response: {
          clientDataJSON: encode(credential.response.clientDataJSON),
          attestationObject: encode(credential.response.attestationObject),
        },
        id: credential.id,
        type: credential.type,
      };

      // Step 4: Submit credential to the server
      const result = await handleFetch('/api/auth/passkey/signup/public-key', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(credentialData),
      });

      // Redirect user on success
      window.location.href = result.location;
    } catch (err) {
      console.error('Passkey register error:', err);
      alert(err?.message || 'Passkey registration error');
    } finally {
      setLoading(false);
    }
  }
  // Choose which flow
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
  const providerComponents: Record<string, JSX.Element | null> = {
    discord:
        startupConfig.discordLoginEnabled ? (
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
    facebook:
        startupConfig.facebookLoginEnabled ? (
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
    github:
        startupConfig.githubLoginEnabled ? (
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
    google:
        startupConfig.googleLoginEnabled ? (
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
    passkeys:
        startupConfig.passkeyLoginEnabled ? (
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
    openid:
        startupConfig.openidLoginEnabled ? (
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
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t border-gray-300 uppercase dark:border-gray-600">
              <div className="absolute bg-white px-3 text-xs text-black dark:bg-gray-900 dark:text-white">
                {localize('com_auth_or')} {/* i.e. "Or" */}
              </div>
            </div>
            <div className="mt-8" />
          </>
        )}
        <div className="mt-2 flex flex-col space-y-2">
          {startupConfig.socialLogins?.map((provider) => providerComponents[provider] || null)}
        </div>

        {/* ---------------------------------------
         * Signup Form (Visible Only in Register Mode)
         * --------------------------------------- */}
        {mode === 'register' && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold">{localize('com_auth_signup')}</h2>
            <form onSubmit={handlePasskeyRegister}>
              <div className="mt-2">
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
            </form>
          </div>
        )}
      </>
    )
  );
}

export default SocialLoginRender;