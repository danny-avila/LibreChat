import { useRecoilState } from 'recoil';
import { Dropdown } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function LanguageSTTDropdown() {
  const localize = useLocalize();
  const [languageSTT, setLanguageSTT] = useRecoilState<string>(store.languageSTT);

  const languageOptions = [
    { value: 'ar-MA', label: 'العربية (المغرب)' },
    { value: 'fr-MA', label: 'Français (Maroc)' },
    { value: 'fr-FR', label: 'Français' },
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'ar-EG', label: 'العربية (مصر)' },
    { value: 'ar-SA', label: 'العربية (السعودية)' },
    { value: 'ar-DZ', label: 'العربية (الجزائر)' },
    { value: 'ar-TN', label: 'العربية (تونس)' },
    { value: 'ar-JO', label: 'Arabic (Jordan)' },
    { value: 'ar-KW', label: 'Arabic (Kuwait)' },
    { value: 'ar-LB', label: 'Arabic (Lebanon)' },
    { value: 'ar-QA', label: 'Arabic (Qatar)' },
    { value: 'ar-AE', label: 'Arabic (UAE)' },
    { value: 'ar-IQ', label: 'Arabic (Iraq)' },
    { value: 'ar-BH', label: 'Arabic (Bahrain)' },
    { value: 'ar-LY', label: 'Arabic (Libya)' },
    { value: 'ar-OM', label: 'Arabic (Oman)' },
    { value: 'ar-YE', label: 'Arabic (Yemen)' },
    { value: 'af', label: 'Afrikaans' },
    { value: 'eu', label: 'Basque' },
    { value: 'bg', label: 'Bulgarian' },
    { value: 'ca', label: 'Catalan' },
    { value: 'cs', label: 'Czech' },
    { value: 'nl-NL', label: 'Dutch' },
    { value: 'en-AU', label: 'English (Australia)' },
    { value: 'en-CA', label: 'English (Canada)' },
    { value: 'en-IN', label: 'English (India)' },
    { value: 'en-NZ', label: 'English (New Zealand)' },
    { value: 'en-ZA', label: 'English (South Africa)' },
    { value: 'et-EE', label: 'Estonian' },
    { value: 'fi', label: 'Finnish' },
    { value: 'gl', label: 'Galician' },
    { value: 'de-DE', label: 'German' },
    { value: 'el-GR', label: 'Greek' },
    { value: 'he', label: 'Hebrew' },
    { value: 'hu', label: 'Hungarian' },
    { value: 'is', label: 'Icelandic' },
    { value: 'id', label: 'Indonesian' },
    { value: 'it-IT', label: 'Italian' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'la', label: 'Latin' },
    { value: 'lv-LV', label: 'Latvian' },
    { value: 'lt-LT', label: 'Lithuanian' },
    { value: 'ms-MY', label: 'Malaysian' },
    { value: 'zh-CN', label: 'Mandarin Chinese' },
    { value: 'no-NO', label: 'Norwegian' },
    { value: 'pl', label: 'Polish' },
    { value: 'pt-PT', label: 'Portuguese' },
    { value: 'pt-br', label: 'Portuguese (Brasil)' },
    { value: 'ro-RO', label: 'Romanian' },
    { value: 'ru', label: 'Russian' },
    { value: 'sr-SP', label: 'Serbian' },
    { value: 'sk', label: 'Slovak' },
    { value: 'es-ES', label: 'Spanish (Spain)' },
    { value: 'es-MX', label: 'Spanish (Mexico)' },
    { value: 'es-AR', label: 'Spanish (Argentina)' },
    { value: 'es-BO', label: 'Spanish (Bolivia)' },
    { value: 'es-CL', label: 'Spanish (Chile)' },
    { value: 'es-CO', label: 'Spanish (Colombia)' },
    { value: 'es-CR', label: 'Spanish (Costa Rica)' },
    { value: 'es-DO', label: 'Spanish (Dominican Republic)' },
    { value: 'es-EC', label: 'Spanish (Ecuador)' },
    { value: 'es-SV', label: 'Spanish (El Salvador)' },
    { value: 'es-GT', label: 'Spanish (Guatemala)' },
    { value: 'es-HN', label: 'Spanish (Honduras)' },
    { value: 'es-NI', label: 'Spanish (Nicaragua)' },
    { value: 'es-PA', label: 'Spanish (Panama)' },
    { value: 'es-PY', label: 'Spanish (Paraguay)' },
    { value: 'es-PE', label: 'Spanish (Peru)' },
    { value: 'es-PR', label: 'Spanish (Puerto Rico)' },
    { value: 'es-US', label: 'Spanish (US)' },
    { value: 'es-UY', label: 'Spanish (Uruguay)' },
    { value: 'es-VE', label: 'Spanish (Venezuela)' },
    { value: 'sv-SE', label: 'Swedish' },
    { value: 'zh-TW', label: 'Taiwanese' },
    { value: 'zh-HK', label: 'Cantonese' },
    { value: 'tr', label: 'Turkish' },
    { value: 'zu', label: 'Zulu' },
  ];

  const handleSelect = (value: string) => {
    setLanguageSTT(value);
  };

  const labelId = 'language-stt-dropdown-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_language')}</div>
      <Dropdown
        value={languageSTT}
        onChange={handleSelect}
        options={languageOptions}
        sizeClasses="[--anchor-max-height:256px]"
        testId="LanguageSTTDropdown"
        className="z-50"
        aria-labelledby={labelId}
      />
    </div>
  );
}
