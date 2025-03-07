import { useRecoilState } from 'recoil';
import Cookies from 'js-cookie';
import React, { useContext, useCallback } from 'react';
import UserMsgMarkdownSwitch from './UserMsgMarkdownSwitch';
import HideSidePanelSwitch from './HideSidePanelSwitch';
import { ThemeContext, useLocalize } from '~/hooks';
import AutoScrollSwitch from './AutoScrollSwitch';
import ArchivedChats from './ArchivedChats';
import { Dropdown } from '~/components/ui';
import store from '~/store';

export const ThemeSelector = ({
  theme,
  onChange,
}: {
  theme: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  const themeOptions = [
    { value: 'system', label: localize('com_nav_theme_system') },
    { value: 'dark', label: localize('com_nav_theme_dark') },
    { value: 'light', label: localize('com_nav_theme_light') },
  ];

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_theme')}</div>

      <Dropdown
        value={theme}
        onChange={onChange}
        options={themeOptions}
        sizeClasses="w-[180px]"
        testId="theme-selector"
      />
    </div>
  );
};

export const LangSelector = ({
  langcode,
  onChange,
}: {
  langcode: string;
  onChange: (value: string) => void;
}) => {
  const localize = useLocalize();

  const languageOptions = [
    { value: 'auto', label: localize('com_nav_lang_auto') },
    { value: 'en-US', label: localize('com_nav_lang_english') },
    { value: 'zh-Hans', label: localize('com_nav_lang_chinese') },
    { value: 'zh-Hant', label: localize('com_nav_lang_traditional_chinese') },
    { value: 'ar-EG', label: localize('com_nav_lang_arabic') },
    { value: 'de-DE', label: localize('com_nav_lang_german') },
    { value: 'es-ES', label: localize('com_nav_lang_spanish') },
    { value: 'et-EE', label: localize('com_nav_lang_estonian') },
    { value: 'fr-FR', label: localize('com_nav_lang_french') },
    { value: 'it-IT', label: localize('com_nav_lang_italian') },
    { value: 'pl-PL', label: localize('com_nav_lang_polish') },
    { value: 'pt-BR', label: localize('com_nav_lang_brazilian_portuguese') },
    { value: 'pt-PT', label: localize('com_nav_lang_portuguese') },
    { value: 'ru-RU', label: localize('com_nav_lang_russian') },
    { value: 'ja-JP', label: localize('com_nav_lang_japanese') },
    { value: 'ka-GE', label: localize('com_nav_lang_georgian') },
    { value: 'sv-SE', label: localize('com_nav_lang_swedish') },
    { value: 'ko-KR', label: localize('com_nav_lang_korean') },
    { value: 'vi-VN', label: localize('com_nav_lang_vietnamese') },
    { value: 'th-TH', label: localize('com_nav_lang_thai') },
    { value: 'tr-TR', label: localize('com_nav_lang_turkish') },
    { value: 'nl-NL', label: localize('com_nav_lang_dutch') },
    { value: 'id-ID', label: localize('com_nav_lang_indonesia') },
    { value: 'he-HE', label: localize('com_nav_lang_hebrew') },
    { value: 'fi-FI', label: localize('com_nav_lang_finnish') },
  ];

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_language')}</div>

      <Dropdown
        value={langcode}
        onChange={onChange}
        sizeClasses="[--anchor-max-height:256px]"
        options={languageOptions}
      />
    </div>
  );
};

function General() {
  const { theme, setTheme } = useContext(ThemeContext);

  const [langcode, setLangcode] = useRecoilState(store.lang);

  const changeTheme = useCallback(
    (value: string) => {
      setTheme(value);
    },
    [setTheme],
  );

  const changeLang = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });
      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
    },
    [setLangcode],
  );

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <ThemeSelector theme={theme} onChange={changeTheme} />
      </div>
      <div className="pb-3">
        <LangSelector langcode={langcode} onChange={changeLang} />
      </div>
      <div className="pb-3">
        <UserMsgMarkdownSwitch />
      </div>
      <div className="pb-3">
        <AutoScrollSwitch />
      </div>
      <div className="pb-3">
        <HideSidePanelSwitch />
      </div>
      <div className="pb-3">
        <ArchivedChats />
      </div>
    </div>
  );
}

export default React.memo(General);
