import React, { useCallback, useState } from 'react';
import { isNativePlatform, signInWithAppleNative, signInWithBrowser } from '~/utils/nativeAuth';

type Props = {
  id: string;
  enabled: boolean;
  serverDomain: string;
  oauthPath: string;
  Icon: React.ComponentType;
  label: string;
};

const baseClassName =
  'flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-[rgba(11,47,91,0.14)] bg-white text-[15px] font-semibold text-ink-900 transition-colors duration-200 hover:bg-paper-100 disabled:opacity-60 dark:border-white/[0.14] dark:bg-dm-surface dark:text-dm-text dark:hover:bg-dm-surface2';

const SocialButton: React.FC<Props> = ({ id, enabled, serverDomain, oauthPath, Icon, label }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const native = isNativePlatform();

  const onNativeClick = useCallback(async () => {
    if (busy) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (oauthPath === 'apple') {
        await signInWithAppleNative();
      } else {
        await signInWithBrowser(oauthPath);
      }
    } catch (err) {
      const anyErr = err as {
        response?: { status?: number; data?: { message?: string; code?: string } };
        message?: string;
      };
      const serverMessage = anyErr?.response?.data?.message;
      const serverCode = anyErr?.response?.data?.code;
      const status = anyErr?.response?.status;
      const message = serverMessage || anyErr?.message || 'Sign-in failed';
      if (!/cancel/i.test(message)) {
        setError(message);
        console.error(
          `[SocialButton:${id}] native sign-in failed`,
          JSON.stringify({ status, code: serverCode, message, raw: anyErr?.message ?? null }),
        );
      }
    } finally {
      setBusy(false);
    }
  }, [busy, oauthPath, id]);

  if (!enabled) {
    return null;
  }

  if (native) {
    return (
      <div className="flex w-full flex-col gap-1">
        <button
          aria-label={label}
          className={baseClassName}
          data-testid={id}
          disabled={busy}
          onClick={onNativeClick}
          type="button"
        >
          <span className="flex h-5 w-5 items-center justify-center">
            <Icon />
          </span>
          <span>{label}</span>
        </button>
        {error && (
          <p className="text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <a
      aria-label={`${label}`}
      className={baseClassName}
      href={`${serverDomain}/oauth/${oauthPath}`}
      data-testid={id}
    >
      <span className="flex h-5 w-5 items-center justify-center">
        <Icon />
      </span>
      <span>{label}</span>
    </a>
  );
};

export default SocialButton;
