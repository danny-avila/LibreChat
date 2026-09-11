import React, { useEffect, memo } from 'react';
import TagManager from 'react-gtm-module';
import ReactMarkdown from 'react-markdown';
import { Constants } from 'librechat-data-provider';
import type { TStartupConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

type FooterProps = {
  className?: string;
  startupConfig?: FooterStartupConfig | null;
  /** A started conversation keeps only what the deployment configured. The
   *  generic model disclaimer belongs to the welcome screen, where it is first
   *  read, but a custom footer, a privacy policy and terms of service are the
   *  operator's own content: scoping the disclaimer out must not take their
   *  configuration off the screen that used to carry it. With nothing
   *  configured, this renders nothing at all. */
  configuredOnly?: boolean;
};

type FooterStartupConfig = Pick<Partial<TStartupConfig>, 'analyticsGtmId' | 'customFooter'> & {
  interface?: Pick<NonNullable<TStartupConfig['interface']>, 'privacyPolicy' | 'termsOfService'>;
};

export type ConfiguredFooter = {
  /** Whether a footer bar belongs under the composer in a conversation: the
   *  deployment configured a custom footer, a privacy policy or terms of
   *  service. Before the startup config answers this is the answer the last
   *  load recorded, which is what keeps a cold load from laying out twice. */
  present: boolean;
  /** The startup config has answered on this load. */
  resolved: boolean;
};

const CONFIGURED_FOOTER_KEY = 'configured-footer';

/** The last answer this deployment gave. A deployment's footer configuration is
 *  a deployment-lifetime fact, and `/api/config` answers after the composer has
 *  painted, so the composer needs something better than a guess to lay out
 *  against: remembering the answer makes every load after the first one exact.
 *  A first-ever visit falls back to LibreChat's default, no configured footer,
 *  and settles once when the answer disagrees. */
function rememberedFooter(): boolean {
  try {
    return localStorage.getItem(CONFIGURED_FOOTER_KEY) === 'true';
  } catch {
    /** Storage can be denied outright; a guess is still better than a crash. */
    return false;
  }
}

/**
 * What a conversation has to render beneath its composer. The conversation
 * renders the footer only for configured content, and the composer above it
 * reserves the band that bar needs — the bar is absolutely positioned in a
 * zero-height wrapper, so a composer that did not reserve it would be painted
 * over. Both decisions read this one answer so they cannot disagree.
 */
export function useConfiguredFooter(): ConfiguredFooter {
  /** Success, not completion: a config request that exhausted its retries has
   *  answered nothing, and treating that as "no footer configured" would both
   *  drop the clearance a remembered deployment needs and overwrite the memory
   *  with a guess that moves the composer again on the next good load. */
  const { data: config, isSuccess } = useGetStartupConfig();
  const configured =
    typeof config?.customFooter === 'string' ||
    config?.interface?.privacyPolicy?.externalUrl != null ||
    config?.interface?.termsOfService?.externalUrl != null;

  useEffect(() => {
    if (!isSuccess) {
      return;
    }
    try {
      localStorage.setItem(CONFIGURED_FOOTER_KEY, String(configured));
    } catch {
      /** Nothing to do: the next load falls back to the default. */
    }
  }, [configured, isSuccess]);

  return { present: isSuccess ? configured : rememberedFooter(), resolved: isSuccess };
}

function Footer({ className, startupConfig, configuredOnly = false }: FooterProps) {
  const shouldFetchConfig = startupConfig === undefined;
  const { data: fetchedConfig } = useGetStartupConfig({ enabled: shouldFetchConfig });
  const config = shouldFetchConfig ? fetchedConfig : startupConfig;
  const localize = useLocalize();

  const privacyPolicy = config?.interface?.privacyPolicy;
  const termsOfService = config?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl != null && (
    <a className="text-text-muted underline" href={privacyPolicy.externalUrl} rel="noreferrer">
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl != null && (
    <a className="text-text-muted underline" href={termsOfService.externalUrl} rel="noreferrer">
      {localize('com_ui_terms_of_service')}
    </a>
  );

  const configuredFooter = typeof config?.customFooter === 'string' ? config.customFooter : null;
  /** The generic disclaimer is the part a conversation drops; operator content is not. */
  const genericFooter = configuredOnly
    ? ''
    : '[LibreChat ' +
      Constants.VERSION +
      '](https://librechat.ai) - ' +
      localize('com_ui_latest_footer');
  const mainContent = configuredFooter ?? genericFooter;
  const mainContentParts = mainContent === '' ? [] : mainContent.split('|');

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
                className="text-text-muted underline"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
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

  /** A conversation with no configured footer has nothing to place, so it does
   *  not place an empty bar over the bottom of the thread. */
  if (footerElements.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full">
      <div
        className={
          className ??
          /* The disclaimer is the least important text on the landing page and
             sat in `text-primary`, the same weight as the greeting above it.
             `text-muted` is the quietest text token that still clears AA for
             12px copy on `bg-presentation` — 5.11:1 on white, 7.93:1 on the dark
             canvas — and the contrast modes collapse every text token to pure
             black or white, so they stay at 21:1. The links keep the same colour
             rather than the brighter `text-secondary`: the underline carries the
             affordance, and a link that outshines its own sentence puts the
             emphasis back where this change takes it from. */
          'absolute bottom-0 left-0 right-0 hidden items-center justify-center gap-2 px-2 py-2 text-center text-xs text-text-muted sm:flex md:px-[60px]'
        }
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
