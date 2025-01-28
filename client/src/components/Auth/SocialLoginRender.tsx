import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon, PasskeyIcon } from '~/components';
import { useLocalize } from '~/hooks';
import SocialButton from './SocialButton';
import { TStartupConfig } from 'librechat-data-provider';
import { useState } from 'react';

interface Props {
  startupConfig: TStartupConfig | null | undefined;
  mode: 'login' | 'register'; // decide passkey action
}

function SocialLoginRender({ startupConfig, mode }: Props) {
  const localize = useLocalize();
  const [email, setEmail] = useState(''); // **New State for Email**

  if (!startupConfig) {
    return null;
  }

  /* ---------------------------------------
   * Helper: Create and Submit a Hidden Form
   *---------------------------------------*/
  function submitCredential(endpoint: string, credentialData: any) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = endpoint;

    // Function to add hidden input fields to the form
    function addHiddenInput(name: string, value: string | null) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value || '';
      form.appendChild(input);
    }

    // Flatten the credentialData object
    function flatten(obj: any, prefix = ''): { name: string; value: string }[] {
      const items: { name: string; value: string }[] = [];
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const propName = prefix ? `${prefix}[${key}]` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            items.push(...flatten(obj[key], propName));
          } else {
            items.push({ name: propName, value: obj[key] });
          }
        }
      }
      return items;
    }

    const flatData = flatten(credentialData);
    flatData.forEach(({ name, value }) => addHiddenInput(name, value));

    document.body.appendChild(form);
    form.submit();
  }

  /* ---------------------------------------
   * PASSKEY LOGIN FLOW (Manual Challenge)
   * ---------------------------------------
   * 1) POST /login/public-key/challenge
   * 2) navigator.credentials.get()
   * 3) Submit a form to /login/public-key
   */
  async function handlePasskeyLogin() {
    try {
      // Step A: Request challenge from server
      const challengeRes = await fetch('/api/auth/passkey/login/public-key/challenge', {
        method: 'POST',
        credentials: 'include', // if your server uses cookies
      });
      if (!challengeRes.ok) {
        throw new Error('Failed to retrieve login challenge.');
      }
      const data = await challengeRes.json();
      // data: { challenge: 'base64urlString' }
      const challengeBuffer = base64urlToArrayBuffer(data.challenge);

      // Step B: Request credential from authenticator
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBuffer,
          timeout: 60000, // 60 seconds timeout
          userVerification: 'preferred', // or 'required'
          // Optional extensions
          // extensions: { ... }
        },
      });
      if (!assertion) {
        throw new Error('No credential returned from WebAuthn API.');
      }

      // Prepare credential data for submission
      const credentialData = {
        id: assertion.id,
        type: assertion.type,
        rawId: arrayBufferToBase64url(assertion.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64url(assertion.response.clientDataJSON),
          authenticatorData: arrayBufferToBase64url(assertion.response.authenticatorData),
          signature: arrayBufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle
            ? arrayBufferToBase64url(assertion.response.userHandle)
            : null,
        },
      };

      // Step C: Submit credential via AJAX
      const submitRes = await fetch('/api/auth/passkey/login/public-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentialData),
      });

      if (submitRes.redirected) {
        window.location.href = submitRes.url;
      } else if (!submitRes.ok) {
        const errorData = await submitRes.json();
        throw new Error(errorData.message || 'Passkey login failed.');
      } else {
        // Handle successful login if no redirect
        window.location.href = domains.client;
      }
    } catch (err) {
      console.error('Passkey login error:', err);
      alert(err?.message || 'Passkey login error');
    }
  }

  /* ---------------------------------------
   * PASSKEY SIGNUP FLOW (Manual Challenge)
   * ---------------------------------------
   * 1) POST /signup/public-key/challenge
   * 2) navigator.credentials.create()
   * 3) Submit a form to /signup/public-key
   */
  async function handlePasskeyRegister() {
    try {
      if (!email) {
        throw new Error('Email is required for signup.');
      }

      // Step A: Request challenge from server with email
      const challengeRes = await fetch('/api/auth/passkey/signup/public-key/challenge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!challengeRes.ok) {
        const errorData = await challengeRes.json();
        throw new Error(errorData.message || 'Failed to retrieve signup challenge.');
      }
      const data = await challengeRes.json();
      // data: { user: {...}, challenge: '...' }

      // Convert challenge and user.id from base64url to ArrayBuffer
      const challengeBuffer = base64urlToArrayBuffer(data.challenge);
      const userIdBuffer = base64urlToArrayBuffer(data.user.id);

      // Log received data for debugging
      console.log('Received signup data:', data);

      // Step B: Create credential
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuffer,
          timeout: 60000, // 60 seconds timeout
          rp: {
            name: 'LibreChat', // or your app name
            id: window.location.hostname, // Relying Party ID
          },
          user: {
            id: userIdBuffer,
            name: data.user.email, // Use Email as Username
            displayName: data.user.email, // Use Email as Display Name
          },
          authenticatorSelection: {
            userVerification: 'preferred',
          },
          attestation: 'none', // or 'direct'/'indirect' based on your needs
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
        },
      });
      if (!credential) {
        throw new Error('No credential returned from WebAuthn API.');
      }

      // Prepare credential data for submission
      const credentialData = {
        id: credential.id,
        type: credential.type,
        rawId: arrayBufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64url(
            credential.response.attestationObject,
          ),
        },
      };

      // Step C: Submit credential via AJAX
      const submitRes = await fetch('/api/auth/passkey/signup/public-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentialData),
      });

      if (submitRes.redirected) {
        window.location.href = submitRes.url;
      } else if (!submitRes.ok) {
        const errorData = await submitRes.json();
        throw new Error(errorData.message || 'Passkey registration failed.');
      } else {
        // Handle successful registration if no redirect
        window.location.href = domains.client;
      }
    } catch (err) {
      console.error('Passkey register error:', err);
      alert(err?.message || 'Passkey register error');
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
  const providerComponents = {
    discord: startupConfig.discordLoginEnabled && (
      <SocialButton
        key="discord"
        enabled={startupConfig.discordLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="discord"
        Icon={DiscordIcon}
        label={localize('com_auth_discord_login')}
        id="discord"
      />
    ),
    facebook: startupConfig.facebookLoginEnabled && (
      <SocialButton
        key="facebook"
        enabled={startupConfig.facebookLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="facebook"
        Icon={FacebookIcon}
        label={localize('com_auth_facebook_login')}
        id="facebook"
      />
    ),
    github: startupConfig.githubLoginEnabled && (
      <SocialButton
        key="github"
        enabled={startupConfig.githubLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="github"
        Icon={GithubIcon}
        label={localize('com_auth_github_login')}
        id="github"
      />
    ),
    google: startupConfig.googleLoginEnabled && (
      <SocialButton
        key="google"
        enabled={startupConfig.googleLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="google"
        Icon={GoogleIcon}
        label={localize('com_auth_google_login')}
        id="google"
      />
    ),
    passkeys: startupConfig.passkeyLoginEnabled && (
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
    ),
    openid: startupConfig.openidLoginEnabled && (
      <SocialButton
        key="openid"
        enabled={startupConfig.openidLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="openid"
        Icon={() =>
          startupConfig.openidImageUrl ? (
            <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
          ) : (
            <OpenIDIcon />
          )
        }
        label={startupConfig.openidLabel}
        id="openid"
      />
    ),
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
        <div className="mt-2">
          {startupConfig.socialLogins?.map((provider) => providerComponents[provider] || null)}
        </div>

        {/* ---------------------------------------
         * Signup Form (Visible Only in Register Mode)
         * --------------------------------------- */}
        {mode === 'register' && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold">{localize('com_auth_signup')}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handlePasskeyRegister(); }}> {/* Trigger handlePasskeyRegister on submit */}
              <div className="mt-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  {localize('com_auth_email') || 'Email'}
                </label>
                <input
                  type="email" // Ensures proper email validation
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  required
                />
              </div>
              <button
                type="submit" // Use submit type to trigger form submission
                className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {localize('com_auth_passkey_signup_button') || 'Sign Up with Passkey'}
              </button>
            </form>
          </div>
        )}

      </>
    )
  );
}

export default SocialLoginRender;

/* ---------------------------------------
 * Utility: base64url <-> ArrayBuffer
 *---------------------------------------*/
function base64urlToArrayBuffer(base64urlString: string): ArrayBuffer {
  const base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const str = window.atob(padded);
  const len = str.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buffer[i] = str.charCodeAt(i);
  }
  return buffer.buffer;
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  let base64 = window.btoa(binary);
  // Convert to URL-safe
  base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return base64;
}
