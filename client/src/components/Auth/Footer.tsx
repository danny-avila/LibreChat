import { TStartupConfig } from 'librechat-data-provider';
import { policyUrls } from '~/utils/policies';
import { useLocalize } from '~/hooks';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  /** Read the way the consent reads them, so a blank url is not a policy on one
   *  screen and a link back to this page on another. */
  const { privacyPolicyUrl, termsOfServiceUrl } = policyUrls(startupConfig);

  const privacyPolicyRender = privacyPolicyUrl != null && (
    <a
      className="text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover"
      href={privacyPolicyUrl}
      // Removed for WCAG compliance
      // target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfServiceUrl != null && (
    <a
      className="text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover"
      href={termsOfServiceUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  return (
    <div className="align-end m-4 flex justify-center gap-2" role="contentinfo">
      {privacyPolicyRender}
      {privacyPolicyRender && termsOfServiceRender && (
        <div className="border-r-[1px] border-border-medium" />
      )}
      {termsOfServiceRender}
    </div>
  );
}

export default Footer;
