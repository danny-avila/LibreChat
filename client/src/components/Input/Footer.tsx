import React from 'react';
import { useGetStartupConfig } from 'librechat-data-provider';
import { localize } from '~/localization/Translation';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function Footer() {
  const { data: config } = useGetStartupConfig();
  const lang = useRecoilValue(store.lang);

  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      <a
        href="https://github.com/danny-avila/LibreChat"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {config?.appTitle || 'LibreChat'} v0.5.7
      </a>
      {' - '}. {localize(lang, 'com_ui_pay_per_call')}
    </div>
  );
}
