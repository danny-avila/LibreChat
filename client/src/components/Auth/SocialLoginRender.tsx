// SocialLoginRender.tsx
import React, { useState } from 'react';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon, AppleIcon } from '~/components';
import { useLocalize } from '~/hooks';
import { TStartupConfig } from 'librechat-data-provider';

import SocialButton from './SocialButton';

// Example icon for passkeys (you can use any icon or an inline svg)
function PasskeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="M12 2a7 7 0 00-2.37 13.6V19a2 2 0 004 0v-3.4A7 7 0 0012 2zm-5 7a5 5 0 119 3.28v3.72h-2v2a.5.5 0 01-1 0v-2h-2v-3.72A4.99 4.99 0 017 9z" />
    </svg>
  );
}

function SocialLoginRender({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const [isLoadingPasskey, setIsLoadingPasskey] = useState(false);

  if (!startupConfig) {
    return null;
  }

  // EXAMPLE: A function to handle passkey login.
  // In production, you'll need real user logic, error-handling, base64 conversions, etc.
  const handlePasskeyLogin = async () => {
    try {
      setIsLoadingPasskey(true);

      // 1. (Example) Grab or ask for userId. For demonstration, just a fixed string or prompt.
      const userId = window.prompt('Enter your user ID for Passkey Login:');
      if (!userId) {return;}

      // 2. Get challenge & options from the server
      const beginRes = await fetch('/api/passkeys/login/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!beginRes.ok) {
        throw new Error('Failed to get passkey challenge');
      }
      const options = await beginRes.json();

      // 3. Convert certain fields from base64 strings to ArrayBuffers if necessary.
      //    This example assumes they're already in proper format. Adjust as needed.
      //    For instance:
      //        options.challenge = base64urlToArrayBuffer(options.challenge);
      //        options.allowCredentials = options.allowCredentials.map(cred => ({
      //          ...cred,
      //          id: base64urlToArrayBuffer(cred.id),
      //        }));

      // 4. Call WebAuthn API in the browser
      const credential = (await navigator.credentials.get({
        publicKey: options,
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error('No credential returned from navigator.credentials.get()');
      }

      // 5. Prepare the credential for the server (serialize ArrayBuffers, etc.)
      //    This is minimal example; you might want to base64-encode them:
      const authData = {
        id: credential.id,
        type: credential.type,
        rawId: btoa(
          String.fromCharCode(...new Uint8Array(credential.rawId)),
        ),
        response: {
          clientDataJSON: btoa(
            String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)),
          ),
          authenticatorData: btoa(
            String.fromCharCode(...new Uint8Array(credential.response.authenticatorData)),
          ),
          signature: btoa(
            String.fromCharCode(...new Uint8Array(credential.response.signature)),
          ),
          userHandle: credential.response.userHandle
            ? btoa(String.fromCharCode(...new Uint8Array(credential.response.userHandle)))
            : null,
        },
      };

      // 6. Send credential to the server for verification
      const finishRes = await fetch('/api/passkeys/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: authData }),
      });
      if (!finishRes.ok) {
        throw new Error('Passkey login failed at server verification step.');
      }

      const finishData = await finishRes.json();
      if (!finishData.success) {
        throw new Error('Passkey login was not successful.');
      }

      alert('Passkey login successful!');
      // TODO: Possibly redirect or refresh user context

    } catch (err) {
      console.error('Passkey login error:', err);
      alert('Passkey login failed. Check console for details.');
    } finally {
      setIsLoadingPasskey(false);
    }
  };

  // Build your “providerComponents” just like you do for Google, Discord, etc.
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
    // -- PASSKEYS: Add a new entry if passkey is enabled in your config:
    passkeys: startupConfig.passkeyLoginEnabled && (
      <SocialButton
        key="passkeys"
        enabled={startupConfig.passkeyLoginEnabled}
        Icon={PasskeyIcon}
        label={localize('com_auth_passkey_login') || 'Sign in with Passkey'}
        id="passkeys"
        onClick={handlePasskeyLogin} // <--- Use onClick instead of href
      />
    ),
  };

  return (
    startupConfig.socialLoginEnabled && (
      <>
        {/* If you also support email login, show a divider. Adjust if needed. */}
        {startupConfig.emailLoginEnabled && (
          <>
            <div className="relative mt-6 flex w-full items-center justify-center border border-t border-gray-300 uppercase dark:border-gray-600">
              <div className="absolute bg-white px-3 text-xs text-black dark:bg-gray-900 dark:text-white">
                {localize('com_auth_or', 'Or')}
              </div>
            </div>
            <div className="mt-8" />
          </>
        )}

        {/* Render your social (and passkey) buttons in the order you prefer */}
        <div className="mt-2">
          {startupConfig.socialLogins?.map((provider) => providerComponents[provider] || null)}
          {/* Or if you want passkeys first, reorder accordingly */}
        </div>

        {/* Show some spinner or text if passkey is loading */}
        {isLoadingPasskey && (
          <div className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            {localize('com_auth_loading_passkey', 'Starting Passkey flow...')}
          </div>
        )}
      </>
    )
  );
}

export default SocialLoginRender;
