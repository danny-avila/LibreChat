import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Constants } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { ASSISTANT_DISPLAY_NAME } from '~/constants/branding';

export default function Footer({ className }: { className?: string }) {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();
  const disclaimer =
    'CodeCan AI is for general building code information only, not professional advice. Always verify requirements with qualified professionals or the authority having jurisdiction.';

  const privacyPolicy = config?.interface?.privacyPolicy;
  const termsOfService = config?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl != null && (
    <a
      className="text-text-secondary underline"
      href={privacyPolicy.externalUrl}
      target={privacyPolicy.openNewTab === true ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl != null && (
    <a
      className="text-text-secondary underline"
      href={termsOfService.externalUrl}
      target={termsOfService.openNewTab === true ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const codeCanRender = (
    <a
      className="text-text-secondary underline"
      href="https://codecan.ai"
      target="_blank"
      rel="noreferrer"
    >
      CodeCan AI
    </a>
  );

  const mainContentParts = [ASSISTANT_DISPLAY_NAME];

  const mainContentRender = mainContentParts.map((text, index) => (
    <React.Fragment key={`main-content-part-${index}`}>
      <ReactMarkdown
        components={{
          a: ({ node: _n, href, children, ...otherProps }) => {
            return (
              <a
                className="text-text-secondary underline"
                href={href}
                target="_blank"
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

  const footerElements = [
    ...mainContentRender,
    privacyPolicyRender,
    termsOfServiceRender,
    codeCanRender,
  ].filter(Boolean);

  return (
    <div className="relative w-full">
      <div
        className={
          className ??
          'absolute bottom-0 left-0 right-0 hidden flex-col items-center justify-center gap-1 px-2 py-2 text-center text-xs text-text-primary sm:flex md:px-[60px]'
        }
        role="contentinfo"
      >
        <div className="flex items-center justify-center gap-2">
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
        <p className="max-w-4xl text-[11px] leading-4 text-text-secondary">{disclaimer}</p>
      </div>
    </div>
  );
}
