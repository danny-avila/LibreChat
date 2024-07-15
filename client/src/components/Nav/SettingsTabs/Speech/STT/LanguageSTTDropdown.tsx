import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function LanguageSTTDropdown() {
  const localize = useLocalize();
  const [languageSTT, setLanguageSTT] = useRecoilState<string>(store.languageSTT);

  const languageOptions = [
    { value: 'af', display: 'Afrikaans' },
    { value: 'eu', display: 'Basque' },
    { value: 'bg', display: 'Bulgarian' },
    { value: 'ca', display: 'Catalan' },
    { value: 'ar-EG', display: 'Arabic (Egypt)' },
    { value: 'ar-JO', display: 'Arabic (Jordan)' },
    { value: 'ar-KW', display: 'Arabic (Kuwait)' },
    { value: 'ar-LB', display: 'Arabic (Lebanon)' },
    { value: 'ar-QA', display: 'Arabic (Qatar)' },
    { value: 'ar-AE', display: 'Arabic (UAE)' },
    { value: 'ar-MA', display: 'Arabic (Morocco)' },
    { value: 'ar-IQ', display: 'Arabic (Iraq)' },
    { value: 'ar-DZ', display: 'Arabic (Algeria)' },
    { value: 'ar-BH', display: 'Arabic (Bahrain)' },
    { value: 'ar-LY', display: 'Arabic (Libya)' },
    { value: 'ar-OM', display: 'Arabic (Oman)' },
    { value: 'ar-SA', display: 'Arabic (Saudi Arabia)' },
    { value: 'ar-TN', display: 'Arabic (Tunisia)' },
    { value: 'ar-YE', display: 'Arabic (Yemen)' },
    { value: 'cs', display: 'Czech' },
    { value: 'nl-NL', display: 'Dutch' },
    { value: 'en-AU', display: 'English (Australia)' },
    { value: 'en-CA', display: 'English (Canada)' },
    { value: 'en-IN', display: 'English (India)' },
    { value: 'en-NZ', display: 'English (New Zealand)' },
    { value: 'en-ZA', display: 'English (South Africa)' },
    { value: 'en-GB', display: 'English (UK)' },
    { value: 'en-US', display: 'English (US)' },
    { value: 'fi', display: 'Finnish' },
    { value: 'fr-FR', display: 'French' },
    { value: 'gl', display: 'Galician' },
    { value: 'de-DE', display: 'German' },
    { value: 'el-GR', display: 'Greek' },
    { value: 'he', display: 'Hebrew' },
    { value: 'hu', display: 'Hungarian' },
    { value: 'is', display: 'Icelandic' },
    { value: 'it-IT', display: 'Italian' },
    { value: 'id', display: 'Indonesian' },
    { value: 'ja', display: 'Japanese' },
    { value: 'ko', display: 'Korean' },
    { value: 'la', display: 'Latin' },
    { value: 'zh-CN', display: 'Mandarin Chinese' },
    { value: 'zh-TW', display: 'Taiwanese' },
    { value: 'zh-HK', display: 'Cantonese' },
    { value: 'ms-MY', display: 'Malaysian' },
    { value: 'no-NO', display: 'Norwegian' },
    { value: 'pl', display: 'Polish' },
    { value: 'xx-piglatin', display: 'Pig Latin' },
    { value: 'pt-PT', display: 'Portuguese' },
    { value: 'pt-br', display: 'Portuguese (Brasil)' },
    { value: 'ro-RO', display: 'Romanian' },
    { value: 'ru', display: 'Russian' },
    { value: 'sr-SP', display: 'Serbian' },
    { value: 'sk', display: 'Slovak' },
    { value: 'es-AR', display: 'Spanish (Argentina)' },
    { value: 'es-BO', display: 'Spanish (Bolivia)' },
    { value: 'es-CL', display: 'Spanish (Chile)' },
    { value: 'es-CO', display: 'Spanish (Colombia)' },
    { value: 'es-CR', display: 'Spanish (Costa Rica)' },
    { value: 'es-DO', display: 'Spanish (Dominican Republic)' },
    { value: 'es-EC', display: 'Spanish (Ecuador)' },
    { value: 'es-SV', display: 'Spanish (El Salvador)' },
    { value: 'es-GT', display: 'Spanish (Guatemala)' },
    { value: 'es-HN', display: 'Spanish (Honduras)' },
    { value: 'es-MX', display: 'Spanish (Mexico)' },
    { value: 'es-NI', display: 'Spanish (Nicaragua)' },
    { value: 'es-PA', display: 'Spanish (Panama)' },
    { value: 'es-PY', display: 'Spanish (Paraguay)' },
    { value: 'es-PE', display: 'Spanish (Peru)' },
    { value: 'es-PR', display: 'Spanish (Puerto Rico)' },
    { value: 'es-ES', display: 'Spanish (Spain)' },
    { value: 'es-US', display: 'Spanish (US)' },
    { value: 'es-UY', display: 'Spanish (Uruguay)' },
    { value: 'es-VE', display: 'Spanish (Venezuela)' },
    { value: 'sv-SE', display: 'Swedish' },
    { value: 'tr', display: 'Turkish' },
    { value: 'zu', display: 'Zulu' },
  ];

  const handleSelect = (value: string) => {
    setLanguageSTT(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_language')}</div>
      <Dropdown
        value={languageSTT}
        onChange={handleSelect}
        options={languageOptions}
        sizeClasses="[--anchor-max-height:256px]"
        anchor="bottom start"
        testId="LanguageSTTDropdown"
      />
    </div>
  );
}
