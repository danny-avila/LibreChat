import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export type MeoConsent = {
  requestId: string;
  payloadSha256: string;
  confirmationVersion: number;
  providerName: string;
  model: string;
  purpose: string;
  dataCategories: string[];
  destination: string;
  promptCharacters: number;
};

type Props = {
  consent: MeoConsent;
  onResolve: (approved: boolean) => void;
};

export default function MeoConsentDialog({ consent, onResolve }: Props) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => cancelRef.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onResolve(false);
      }}
    >
      <section
        aria-describedby="meo-consent-details"
        aria-labelledby="meo-consent-title"
        aria-modal="true"
        className="bg-surface-primary w-full max-w-lg space-y-5 rounded-2xl border p-6 shadow-xl"
        role="alertdialog"
        tabIndex={-1}
      >
        <header className="space-y-2">
          <h2 className="text-xl font-semibold" id="meo-consent-title">
            {t('meo_web_consent_title')}
          </h2>
          <p className="text-text-secondary text-sm" id="meo-consent-details">
            {t('meo_web_consent_summary', {
              provider: consent.providerName,
              model: consent.model,
              purpose: consent.purpose,
              categories: consent.dataCategories.join(', '),
              destination: consent.destination,
              count: consent.promptCharacters,
            })}
          </p>
        </header>
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => onResolve(false)}
            ref={cancelRef}
            type="button"
          >
            {t('meo_web_consent_cancel')}
          </button>
          <button
            className="bg-surface-secondary rounded-lg px-4 py-2 font-medium"
            onClick={() => onResolve(true)}
            type="button"
          >
            {t('meo_web_consent_continue')}
          </button>
        </div>
      </section>
    </div>
  );
}
