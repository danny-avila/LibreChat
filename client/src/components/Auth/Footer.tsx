import { useLocalize } from '~/hooks';
import { TStartupConfig } from 'librechat-data-provider';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const disclaimer = 'General building code information only. Not professional advice.';
  if (!startupConfig) {
    return null;
  }
  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-brand-blue-500"
      href={privacyPolicy.externalUrl}
      target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className="text-sm text-brand-blue-500"
      href={termsOfService.externalUrl}
      target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const codeCanRender = (
    <a
      className="text-sm text-brand-blue-500"
      href="https://codecan.ai"
      target="_blank"
      rel="noreferrer"
    >
      CodeCan AI
    </a>
  );

  const footerElements = [privacyPolicyRender, termsOfServiceRender, codeCanRender].filter(Boolean);

  return (
    <div className="align-end m-4 flex flex-col items-center gap-2" role="contentinfo">
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
        {footerElements.map((contentRender, index) => {
          const isLastElement = index === footerElements.length - 1;
          return (
            <div key={`footer-element-${index}`} className="flex items-center gap-2">
              {contentRender}
              {!isLastElement && (
                <div className="h-4 border-r-[1px] border-gray-300 dark:border-gray-600" />
              )}
            </div>
          );
        })}
      </div>
      <p className="max-w-2xl text-center text-xs text-gray-500 dark:text-gray-400">{disclaimer}</p>
    </div>
  );
}

export default Footer;
