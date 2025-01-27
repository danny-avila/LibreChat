import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon, AppleIcon, PasskeyIcon } from '~/components';
import { useLocalize } from '~/hooks';
import SocialButton from './SocialButton';

import { TStartupConfig } from 'librechat-data-provider';

function SocialLoginRender({
  startupConfig,
  mode, // 'login' or 'register'
}: {
  startupConfig: TStartupConfig | null | undefined;
  mode: 'login' | 'register';
}) {
  const localize = useLocalize();
  if (!startupConfig) {return null;}

  /* ---------------------------------------
   * 1) Passkey Login Flow
   * -------------------------------------*/
  async function handlePasskeyLogin() {
    try {
      // Step A: Request a challenge from your backend (login route)
      const challengeRes = await fetch('/api/auth/passkey/login/public-key/challenge', {
        method: 'POST',
      });
      if (!challengeRes.ok) {throw new Error('Failed to retrieve login challenge.');}

      const { challenge } = await challengeRes.json();
      const challengeBuffer = base64urlToArrayBuffer(challenge);

      // Step B: Get credential from the authenticator
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBuffer,
          userVerification: 'preferred', // or 'required'
        },
      });
      if (!assertion) {throw new Error('No credential returned from WebAuthn API.');}

      // Step C: Send credential to backend for verification
      const verifyRes = await fetch('/api/auth/passkey/login/public-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyData.ok) {
        console.error('Passkey login failed:', verifyData);
        return;
      }

      // Success
      window.location.href = verifyData.location || '/';
    } catch (err) {
      console.error('Passkey login error:', err);
    }
  }

  /* ---------------------------------------
   * 2) Passkey Registration Flow
   * -------------------------------------*/
  async function handlePasskeyRegister() {
    try {
      // Step A: Request a challenge from your backend
      const challengeRes = await fetch('/api/auth/passkey/signup/public-key/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'myusername',
          name: 'My Display Name',
        }),
      });
      if (!challengeRes.ok) {
        throw new Error('Failed to retrieve signup challenge.');
      }

      const { user, challenge } = await challengeRes.json();
      const challengeBuffer = base64urlToArrayBuffer(challenge);

      // Convert user ID from base64url -> ArrayBuffer if needed
      const userIdBuffer = base64urlToArrayBuffer(user.id);

      // Step B: Create credential
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuffer,
          rp: {
            name: 'LibreChat', // Your Relying Party name
          },
          user: {
            id: userIdBuffer,
            name: user.name,
            displayName: user.displayName,
          },
          authenticatorSelection: {
            userVerification: 'preferred', // or 'required'
          },
          attestation: 'none',
          // The CRITICAL piece:
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256 is most common
            // add more if desired
          ],
        },
      });
      if (!credential) {
        throw new Error('No credential returned from WebAuthn API.');
      }

      // Step C: Send credential to backend
      const registerRes = await fetch('/api/auth/passkey/login/public-key', {
        // or /signup/public-key, depending on your server logic
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: credential.id,
          type: credential.type,
          rawId: arrayBufferToBase64url(credential.rawId),
          response: {
            clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
            attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
          },
        }),
      });

      const registerData = await registerRes.json();
      if (!registerData.ok) {
        console.error('Passkey registration failed:', registerData);
        return;
      }

      // Success
      window.location.href = registerData.location || '/';
    } catch (err) {
      console.error('Passkey register error:', err);
    }
  }

  // Decide which callback to use, based on mode
  function handlePasskey() {
    if (mode === 'register') {
      handlePasskeyRegister();
    } else {
      handlePasskeyLogin();
    }
  }

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
    apple: startupConfig.appleLoginEnabled && (
      <SocialButton
        key="apple"
        enabled={startupConfig.appleLoginEnabled}
        serverDomain={startupConfig.serverDomain}
        oauthPath="apple"
        Icon={AppleIcon}
        label={localize('com_auth_apple_login')}
        id="apple"
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
                      Or
              </div>
            </div>
            <div className="mt-8" />
          </>
        )}
        <div className="mt-2">
          {startupConfig.socialLogins?.map(
            (provider) => providerComponents[provider] || null,
          )}
        </div>
      </>
    )
  );
}

// Utility functions for base64url <-> ArrayBuffer
function base64urlToArrayBuffer(base64urlString) {
  const base64 = base64urlString.replace(/-/g, '+').replace(/_/g, '/');
  const str = window.atob(base64);
  const len = str.length;
  const buffer = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buffer[i] = str.charCodeAt(i);
  }
  return buffer.buffer;
}

function arrayBufferToBase64url(buffer) {
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

export default SocialLoginRender;