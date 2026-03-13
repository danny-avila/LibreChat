import ReactMarkdown from 'react-markdown';
import { useLocalize } from '~/hooks';
import { TStartupConfig } from 'librechat-data-provider';
import { getBlabladorCustomFooter } from '~/utils/blabladorBranding';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;
  const customFooterLines =
    typeof getBlabladorCustomFooter(startupConfig.appTitle, startupConfig.customFooter) === 'string'
      ? getBlabladorCustomFooter(startupConfig.appTitle, startupConfig.customFooter)
          .split('|')
          .map((line) => line.trim())
          .filter(Boolean)
      : null;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-green-600 underline decoration-transparent transition-all duration-200 hover:text-green-700 hover:decoration-green-700 focus:text-green-700 focus:decoration-green-700 dark:text-green-500 dark:hover:text-green-400 dark:hover:decoration-green-400 dark:focus:text-green-400 dark:focus:decoration-green-400"
      href={privacyPolicy.externalUrl}
      // Removed for WCAG compliance
      // target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className="text-sm text-green-600 underline decoration-transparent transition-all duration-200 hover:text-green-700 hover:decoration-green-700 focus:text-green-700 focus:decoration-green-700 dark:text-green-500 dark:hover:text-green-400 dark:hover:decoration-green-400 dark:focus:text-green-400 dark:focus:decoration-green-400"
      href={termsOfService.externalUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const markdownComponents = {
    a: ({ node: _n, href, children, ...otherProps }) => (
      <a
        className="text-sm text-green-600 underline decoration-transparent transition-all duration-200 hover:text-green-700 hover:decoration-green-700 focus:text-green-700 focus:decoration-green-700 dark:text-green-500 dark:hover:text-green-400 dark:hover:decoration-green-400 dark:focus:text-green-400 dark:focus:decoration-green-400"
        href={href}
        rel="noreferrer"
        {...otherProps}
      >
        {children}
      </a>
    ),
    p: ({ node: _n, ...props }) => <span {...props} />,
  };

  return (
    <div
      className="fixed bottom-4 left-0 z-10 flex max-w-[min(40rem,calc(100vw-8rem))] flex-col items-start gap-2 px-6 text-left text-text-primary sm:bottom-5 sm:px-8"
      role="contentinfo"
    >
      {customFooterLines?.map((line, index) => (
        <ReactMarkdown key={`auth-custom-footer-line-${index}`} components={markdownComponents}>
          {line}
        </ReactMarkdown>
      ))}
      {(privacyPolicyRender || termsOfServiceRender) && (
        <div className="flex items-center gap-2">
          {privacyPolicyRender}
          {privacyPolicyRender && termsOfServiceRender && (
            <div className="border-r-[1px] border-gray-300 dark:border-gray-600" />
          )}
          {termsOfServiceRender}
        </div>
      )}
    </div>
  );
}

export default Footer;
