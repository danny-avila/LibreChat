import { TStartupConfig } from 'librechat-data-provider';
import { LegalDocumentLink } from '~/components/LegalDocumentLink';

const authFooterLinkClassName =
  'text-sm text-green-600 underline decoration-transparent transition-all duration-200 hover:text-green-700 hover:decoration-green-700 focus:text-green-700 focus:decoration-green-700 dark:text-green-500 dark:hover:text-green-400 dark:hover:decoration-green-400 dark:focus:text-green-400 dark:focus:decoration-green-400';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  if (!startupConfig) {
    return null;
  }

  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;
  const hasPrivacyPolicy = Boolean(privacyPolicy?.externalUrl);
  const hasTermsOfService = Boolean(termsOfService?.externalUrl);

  const privacyPolicyRender = hasPrivacyPolicy ? (
    <LegalDocumentLink
      config={privacyPolicy}
      labelKey="com_ui_privacy_policy"
      className={authFooterLinkClassName}
    />
  ) : null;

  const termsOfServiceRender = hasTermsOfService ? (
    <LegalDocumentLink
      config={termsOfService}
      labelKey="com_ui_terms_of_service"
      className={authFooterLinkClassName}
    />
  ) : null;

  return (
    <div className="align-end m-4 flex justify-center gap-2" role="contentinfo">
      {privacyPolicyRender}
      {hasPrivacyPolicy && hasTermsOfService && (
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600" />
      )}
      {termsOfServiceRender}
    </div>
  );
}

export default Footer;
