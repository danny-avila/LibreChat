import { useCallback, useRef } from 'react';
import { OGDialog, DialogTemplate, useToastContext } from '@librechat/client';
import { Mail } from 'lucide-react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import { useMailConnectionStatus } from '~/data-provider';
import store from '~/store';

function GmailLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size}>
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0 C43.076,8,45,9.924,45,12.298z" />
    </svg>
  );
}

function MicrosoftLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" width={size} height={size}>
      <rect fill="#f35325" x="1" y="1" width="10" height="10" />
      <rect fill="#81bc06" x="12" y="1" width="10" height="10" />
      <rect fill="#05a6f0" x="1" y="12" width="10" height="10" />
      <rect fill="#ffba08" x="12" y="12" width="10" height="10" />
    </svg>
  );
}

export default function MailOAuthConsentDialog() {
  const [open, setOpen] = useRecoilState(store.mailConsentDialogOpen);
  const setActiveFeature = useSetRecoilState(store.activeFeature);
  const { showToast } = useToastContext();
  const { refetch } = useMailConnectionStatus();
  const { data: startupConfig } = useGetStartupConfig();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleConnect = useCallback(
    (provider: 'gmail' | 'outlook') => {
      const serverDomain = startupConfig?.serverDomain || '';
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        `${serverDomain}/api/mail/connect/${provider}`,
        'mail_oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      // Poll for popup closure
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      pollRef.current = setInterval(() => {
        if (popup?.closed) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          refetch().then((result) => {
            if (result.data?.gmail || result.data?.outlook) {
              setActiveFeature('mail');
              showToast({ message: 'Email connected successfully', status: 'success' });
            }
          });
        }
      }, 500);

      setOpen(false);
    },
    [startupConfig?.serverDomain, refetch, setActiveFeature, showToast, setOpen],
  );

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <DialogTemplate
        title="Connect Your Email"
        className="w-11/12 max-w-lg sm:w-3/4 md:w-1/2"
        showCloseButton={true}
        showCancelButton={false}
        main={
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--feature-mail)' }}
              >
                <Mail size={20} style={{ color: 'var(--feature-mail-icon)' }} />
              </div>
              <p className="text-sm text-text-primary">
                Connect your email account to let AI help you manage, search, and send emails.
              </p>
            </div>
            <div className="space-y-2 rounded-lg bg-surface-secondary p-3 text-xs text-text-secondary">
              <p className="font-medium text-text-primary">What AI can do with your email:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Read and search your emails</li>
                <li>Draft and send emails on your behalf</li>
                <li>Summarize email threads</li>
              </ul>
              <p className="mt-2 text-text-tertiary">
                You can revoke access anytime from Settings.
              </p>
            </div>
          </div>
        }
        buttons={
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              Cancel
            </button>
            <button
              onClick={() => handleConnect('gmail')}
              className="inline-flex h-10 items-center gap-2 justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              <GmailLogo size={18} />
              Connect Gmail
            </button>
            <button
              onClick={() => handleConnect('outlook')}
              className="inline-flex h-10 items-center gap-2 justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              <MicrosoftLogo size={18} />
              Connect Outlook
            </button>
          </div>
        }
      />
    </OGDialog>
  );
}
