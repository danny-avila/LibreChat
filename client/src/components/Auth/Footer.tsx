import React from 'react';
import ReactMarkdown from 'react-markdown';
import { TStartupConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;

  const mainContentParts =
    typeof startupConfig.customLoginFooter === 'string'
      ? startupConfig.customLoginFooter.split('|')
      : [];

  const mainContentRender = mainContentParts.map((text, index) => (
    <React.Fragment key={`main-content-part-${index}`}>
      <ReactMarkdown
        components={{
          a: ({ node: _n, href, children, ...otherProps }) => (
            <a
              className="text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover"
              href={href}
              rel="noreferrer"
              {...otherProps}
            >
              {children}
            </a>
          ),
          p: ({ node: _n, ...props }) => <span className="text-sm" {...props} />,
        }}
      >
        {text.trim()}
      </ReactMarkdown>
    </React.Fragment>
  ));

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover"
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
      className="text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover"
      href={termsOfService.externalUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const footerElements = [...mainContentRender, privacyPolicyRender, termsOfServiceRender].filter(
    Boolean,
  );

  return (
    <div className="align-end m-4 flex justify-center gap-2 text-text-primary" role="contentinfo">
      {footerElements.map((contentRender, index) => {
        const isLastElement = index === footerElements.length - 1;
        return (
          <React.Fragment key={`footer-element-${index}`}>
            {contentRender}
            {!isLastElement && <div className="border-r-[1px] border-border-medium" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default Footer;
