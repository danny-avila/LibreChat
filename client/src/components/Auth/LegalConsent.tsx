import { Trans } from 'react-i18next';
import type { TStartupConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

/** The links sit inside a sentence, so they keep an underline of their own:
 *  colour alone would be the only thing telling them apart from the text
 *  around them. No `target`, like the rest of the auth screens. */
const linkClassName =
  'font-medium text-accent-primary underline underline-offset-2 transition-colors hover:text-accent-primary-hover focus-visible:text-accent-primary-hover';

/** Worded for whichever policies the deployment published, so one it never
 *  wrote is never claimed to have been agreed to. */
const consentKey = (privacyPolicyUrl?: string, termsOfServiceUrl?: string) => {
  if (termsOfServiceUrl == null) {
    return 'com_auth_legal_consent_privacy';
  }
  if (privacyPolicyUrl == null) {
    return 'com_auth_legal_consent_terms';
  }
  return 'com_auth_legal_consent';
};

/**
 * The consent registration is given under, stated where the account is created
 * rather than left to a link beneath the composer. Absent entirely on a
 * deployment that configured neither policy.
 */
function LegalConsent({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const privacyPolicyUrl = startupConfig?.interface?.privacyPolicy?.externalUrl;
  const termsOfServiceUrl = startupConfig?.interface?.termsOfService?.externalUrl;

  if (privacyPolicyUrl == null && termsOfServiceUrl == null) {
    return null;
  }

  return (
    <p className="mt-4 text-center text-sm font-light text-text-secondary">
      <Trans
        i18nKey={consentKey(privacyPolicyUrl, termsOfServiceUrl)}
        components={{
          privacy: (
            <a className={linkClassName} href={privacyPolicyUrl} rel="noreferrer">
              {localize('com_ui_privacy_policy')}
            </a>
          ),
          terms: (
            <a className={linkClassName} href={termsOfServiceUrl} rel="noreferrer">
              {localize('com_ui_terms_of_service')}
            </a>
          ),
        }}
      />
    </p>
  );
}

export default LegalConsent;
