import React, { useEffect, memo } from 'react';
import TagManager from 'react-gtm-module';
import ReactMarkdown from 'react-markdown';
import { Constants } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { LegalDocumentLink } from '~/components/LegalDocumentLink';
import { useLocalize } from '~/hooks';

const chatFooterLinkClassName = 'text-text-secondary underline';

function Footer({ className }: { className?: string }) {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();

  const privacyPolicy = config?.interface?.privacyPolicy;
  const termsOfService = config?.interface?.termsOfService;
  const hasPrivacyPolicy = Boolean(privacyPolicy?.externalUrl);
  const hasTermsOfService = Boolean(termsOfService?.externalUrl);

  const privacyPolicyRender = hasPrivacyPolicy ? (
    <LegalDocumentLink
      config={privacyPolicy}
      labelKey="com_ui_privacy_policy"
      className={chatFooterLinkClassName}
    />
  ) : null;

  const termsOfServiceRender = hasTermsOfService ? (
    <LegalDocumentLink
      config={termsOfService}
      labelKey="com_ui_terms_of_service"
      className={chatFooterLinkClassName}
    />
  ) : null;

  const appTitle = config?.appTitle ?? 'AI Workforce Pro';
  const appUrl = 'https://smbteam.com';

  const mainContentParts = (
    typeof config?.customFooter === 'string'
      ? config.customFooter
      : `[${appTitle} ${Constants.VERSION}](${appUrl}) - ${localize('com_ui_latest_footer')}`
  ).split('|');

  useEffect(() => {
    if (config?.analyticsGtmId != null && typeof window.google_tag_manager === 'undefined') {
      const tagManagerArgs = {
        gtmId: config.analyticsGtmId,
      };
      TagManager.initialize(tagManagerArgs);
    }
  }, [config?.analyticsGtmId]);

  const mainContentRender = mainContentParts.map((text, index) => (
    <React.Fragment key={`main-content-part-${index}`}>
      <ReactMarkdown
        components={{
          a: ({ node: _n, href, children, ...otherProps }) => {
            return (
              <a
                className="text-text-secondary underline"
                href={href}
                rel="noreferrer"
                {...otherProps}
              >
                {children}
              </a>
            );
          },

          p: ({ node: _n, ...props }) => <span {...props} />,
        }}
      >
        {text.trim()}
      </ReactMarkdown>
    </React.Fragment>
  ));

  const footerElements = [...mainContentRender, privacyPolicyRender, termsOfServiceRender].filter(
    Boolean,
  );

  return (
    <div className="relative w-full">
      <div
        className={
          className ??
          'absolute bottom-0 left-0 right-0 hidden items-center justify-center gap-2 px-2 py-2 text-center text-xs text-text-primary sm:flex md:px-[60px]'
        }
        role="contentinfo"
      >
        {footerElements.map((contentRender, index) => {
          const isLastElement = index === footerElements.length - 1;
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
    </div>
  );
}

const MemoizedFooter = memo(Footer);
MemoizedFooter.displayName = 'Footer';

export default MemoizedFooter;
