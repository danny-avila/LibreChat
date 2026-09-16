import React from 'react';
import ReactMarkdown from 'react-markdown';
import { TStartupConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const linkClasses =
  'text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className={linkClasses}
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
      className={linkClasses}
      href={termsOfService.externalUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  /**
   * `interface.loginFooter`, split on `|` into parts that sit beside the policy
   * links, the same shape the chat footer gives `customFooter`. It is a
   * separate field on purpose: the chat footer carries the deployment's note to
   * its own users, this one carries whoever runs the deployment for them.
   *
   * Unset renders nothing, which leaves the footer exactly as it was.
   */
  const loginFooter = startupConfig.interface?.loginFooter;
  const loginFooterRender =
    typeof loginFooter === 'string' && loginFooter.trim() !== ''
      ? loginFooter
          .split('|')
          .map((text) => text.trim())
          .filter((text) => text !== '')
          .map((text, index) => (
            <ReactMarkdown
              key={`login-footer-part-${index}`}
              components={{
                a: ({ node: _node, href, children, ...props }) => (
                  <a
                    className={linkClasses}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
                /* A footer is one line; a paragraph would break it. */
                p: ({ node: _node, ...props }) => (
                  <span className="text-sm text-text-secondary" {...props} />
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          ))
      : [];

  /* The wrapper is rendered even when empty, as it always was: it is the page's
     contentinfo landmark and reserves the same space under the form. */
  const footerElements = [...loginFooterRender, privacyPolicyRender, termsOfServiceRender].filter(
    Boolean,
  );

  return (
    <div className="align-end m-4 flex flex-wrap justify-center gap-2" role="contentinfo">
      {footerElements.map((element, index) => (
        <React.Fragment key={`login-footer-element-${index}`}>
          {element}
          {index < footerElements.length - 1 && (
            <div className="border-r-[1px] border-border-medium" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default Footer;
