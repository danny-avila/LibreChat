import React, { useEffect, memo } from 'react';
import TagManager from 'react-gtm-module';
import ReactMarkdown from 'react-markdown';
import { Constants } from 'librechat-data-provider';
import { BKL_TAGLINE } from '~/components/Bkl/brand';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function Footer({ className }: { className?: string }) {
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

  const mainContentParts = (
    typeof config?.customFooter === 'string'
      ? config.customFooter
      : 'BKL Prism ' + Constants.VERSION
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

  // BKL Prism: 버전 · 태그라인 · 스펙트럼 띠 3층. 예전에는 대기화면 인사말
  // 아래에 태그라인이 따로 있어 같은 화면에서 브랜드 요소가 두 군데로
  // 갈라졌다. 버전 줄 아래로 모아 한 덩어리로 읽히게 한다.
  //
  // `className` 은 공유 보기(ShareView)가 넘기는 값이라 바깥 래퍼가 아니라
  // 버전 줄에만 적용한다 — 래퍼에 얹으면 3층이 가로로 펴진다.
  return (
    <div className="relative w-full">
      <div
        className={cn(
          'gap-1',
          className == null
            ? 'absolute bottom-0 left-0 right-0 hidden flex-col items-center px-2 py-2 text-center text-xs text-text-primary sm:flex md:px-[60px]'
            : 'flex flex-col items-center',
        )}
        role="contentinfo"
      >
        <div className={className ?? 'flex items-center justify-center gap-2'}>
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
        <p className="text-[11px] leading-none text-text-secondary">{BKL_TAGLINE}</p>
        <hr className="prism-rule w-24" aria-hidden="true" />
      </div>
    </div>
  );
}

const MemoizedFooter = memo(Footer);
MemoizedFooter.displayName = 'Footer';

export default MemoizedFooter;
