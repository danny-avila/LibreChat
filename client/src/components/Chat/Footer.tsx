import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import TagManager from 'react-gtm-module';
import { Constants } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { getBlabladorCustomFooter } from '~/utils/blabladorBranding';

const markdownComponents = {
  a: ({ node: _n, href, children, ...otherProps }) => {
    return (
      <a className="text-text-secondary underline" href={href} rel="noreferrer" {...otherProps}>
        {children}
      </a>
    );
  },
  p: ({ node: _n, ...props }) => <span {...props} />,
};

export default function Footer({ className }: { className?: string }) {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();

  const privacyPolicy = config?.interface?.privacyPolicy;
  const termsOfService = config?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl != null && (
    <a className="text-text-secondary underline" href={privacyPolicy.externalUrl} rel="noreferrer">
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl != null && (
    <a className="text-text-secondary underline" href={termsOfService.externalUrl} rel="noreferrer">
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const customFooterLines =
    typeof getBlabladorCustomFooter(config?.appTitle, config?.customFooter) === 'string'
      ? getBlabladorCustomFooter(config?.appTitle, config?.customFooter)
          .split('|')
          .map((line) => line.trim())
          .filter(Boolean)
      : null;
  const defaultFooterParts = (
    '[LibreChat ' + Constants.VERSION + '](https://librechat.ai) - ' + localize('com_ui_latest_footer')
  ).split('|');

  useEffect(() => {
    if (config?.analyticsGtmId != null && typeof window.google_tag_manager === 'undefined') {
      const tagManagerArgs = {
        gtmId: config.analyticsGtmId,
      };
      TagManager.initialize(tagManagerArgs);
    }
  }, [config?.analyticsGtmId]);

  const defaultFooterElements = [
    ...defaultFooterParts.map((text, index) => (
      <React.Fragment key={`main-content-part-${index}`}>
        <ReactMarkdown components={markdownComponents}>{text.trim()}</ReactMarkdown>
      </React.Fragment>
    )),
    privacyPolicyRender,
    termsOfServiceRender,
  ].filter(Boolean);

  return (
    <div className="relative w-full">
      <div
        className={
          className ??
          'absolute bottom-0 left-0 hidden px-6 py-3 text-xs text-text-primary sm:flex'
        }
        role="contentinfo"
      >
        {customFooterLines ? (
          <div className="flex flex-col items-start gap-1 text-left">
            {customFooterLines.map((line, index) => (
              <ReactMarkdown key={`custom-footer-line-${index}`} components={markdownComponents}>
                {line}
              </ReactMarkdown>
            ))}
            {(privacyPolicyRender || termsOfServiceRender) && (
              <div className="mt-1 flex items-center gap-2">
                {privacyPolicyRender}
                {privacyPolicyRender && termsOfServiceRender && (
                  <div className="h-2 border-r-[1px] border-border-medium" />
                )}
                {termsOfServiceRender}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-start gap-2 text-left">
            {defaultFooterElements.map((contentRender, index) => {
              const isLastElement = index === defaultFooterElements.length - 1;
              return (
                <React.Fragment key={`footer-element-${index}`}>
                  {contentRender}
                  {!isLastElement && (
                    <div
                      key={`separator-${index}`}
                      className="h-2 border-r-[1px] border-border-medium"
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
