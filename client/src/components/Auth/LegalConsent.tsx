import { Trans } from 'react-i18next';
import type { TStartupConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

/** The links sit inside a sentence, so they keep an underline of their own:
 *  colour alone would be the only thing telling them apart from the text
 *  around them. No `target`, like the rest of the auth screens. */
const linkClassName =
  'font-medium text-accent-primary underline underline-offset-2 transition-colors hover:text-accent-primary-hover focus-visible:text-accent-primary-hover';

/** `externalUrl` is an optional string, so a deployment can set it to nothing.
 *  A blank URL is not a published policy: it would render a link back to the
 *  page the reader is on and name a document that does not exist. */
const publishedUrl = (externalUrl?: string) => {
  const url = externalUrl?.trim();
  return url != null && url !== '' ? url : undefined;
};

const policyUrls = (startupConfig: TStartupConfig | null | undefined) => ({
  privacyPolicyUrl: publishedUrl(startupConfig?.interface?.privacyPolicy?.externalUrl),
  termsOfServiceUrl: publishedUrl(startupConfig?.interface?.termsOfService?.externalUrl),
});

/** Whether the deployment published anything to consent to. The auth layout
 *  reads this to choose between the consent and its footer bar, so the two
 *  cannot disagree about whether the sentence is on the screen. */
export function hasPublishedPolicies(startupConfig: TStartupConfig | null | undefined): boolean {
  const { privacyPolicyUrl, termsOfServiceUrl } = policyUrls(startupConfig);
  return privacyPolicyUrl != null || termsOfServiceUrl != null;
}

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
 * The consent an account is created under, stated where it is created rather
 * than left to a link beneath the composer. It closes the auth card, so it
 * covers the registration form and the provider buttons alike: a first sign-in
 * through a provider creates an account too. Absent entirely on a deployment
 * that published neither policy.
 */
function LegalConsent({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const { privacyPolicyUrl, termsOfServiceUrl } = policyUrls(startupConfig);

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
