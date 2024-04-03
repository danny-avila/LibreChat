import React, { useState, useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import LightningIcon from '~/components/svg/LightningIcon';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import CautionIcon from '~/components/svg/CautionIcon';
import SunIcon from '~/components/svg/SunIcon';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function Landing() {
  const [logoSrc, setLogoSrc] = useState('');
  const [altText, setAltText] = useState('');

  useEffect(() => {
    const host = window.location.hostname;
    let logoPath = '';
    let alt = '';

    switch (host) {
      case 'gptglobal.io':
        logoPath = '/assets/logo-global.png';
        alt = 'GPT Global';
        break;
      case 'gptchina.io':
        logoPath = '/assets/logo-china.png';
        alt = 'GPT China';
        break;
      case 'gptusa.io':
        logoPath = '/assets/logo-usa.png';
        alt = 'GPT USA';
        break;
      case 'gptrussia.io':
        logoPath = '/assets/logo-russia.png';
        alt = 'GPT Russia';
        break;
      default:
        logoPath = '/assets/logo-china.png';
        alt = 'GPT Global';
    }

    setLogoSrc(logoPath);
    setAltText(alt);
  }, []);

  const { data: config } = useGetStartupConfig();
  const setText = useSetRecoilState(store.text);
  const conversation = useRecoilValue(store.conversation);
  const localize = useLocalize();
  const { title = localize('com_ui_new_chat') } = conversation ?? {};

  useDocumentTitle(title);

  const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const { innerText } = e.target as HTMLButtonElement;
    const quote = innerText.split('"')[1].trim();
    setText(quote);
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
      <div className="w-full px-6 text-gray-800 dark:text-gray-200 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
        <h1
          id="landing-title"
          data-testid="landing-title"
          className="mb-10 ml-auto mr-auto mt-6 flex items-center justify-center gap-2 text-center text-4xl font-semibold dark:text-gray-600 sm:mb-16 md:mt-[10vh]"
        >
          <img src={logoSrc} alt={altText} className="h-auto w-1/2 object-contain sm:w-1/3" />
        </h1>
        <div className="items-start gap-3.5 text-center md:flex">
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <SunIcon />
              {localize('com_ui_examples')}
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-600"
              >
                &quot;{localize('com_ui_example_quantum_computing')}&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-600"
              >
                &quot;{localize('com_ui_example_10_year_old_b_day')}&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-600"
              >
                &quot;{localize('com_ui_example_http_in_js')}&quot; →
              </button>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <LightningIcon />
              {localize('com_ui_capabilities')}
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_capability_remember')}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_capability_correction')}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_capability_decline_requests')}
              </li>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <CautionIcon />
              {localize('com_ui_limitations')}
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_limitation_incorrect_info')}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_limitation_harmful_biased')}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {localize('com_ui_limitation_limited_2021')}
              </li>
            </ul>
          </div>
        </div>
        {/* {!showingTemplates && (
          <div className="mt-8 mb-4 flex flex-col items-center gap-3.5 md:mt-16">
            <button
              onClick={showTemplates}
              className="btn btn-neutral justify-center gap-2 border-0 md:border"
            >
              <ChatIcon />
              Show Prompt Templates
            </button>
          </div>
        )}
        {!!showingTemplates && <Templates showTemplates={showTemplates}/>} */}
        {/* <div className="group h-32 w-full flex-shrink-0 dark:border-gray-800/50 dark:bg-gray-800 md:h-48" /> */}
      </div>
    </div>
  );
}
