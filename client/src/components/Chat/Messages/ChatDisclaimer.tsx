import { useTranslation } from 'react-i18next';
import { useGetStartupConfig } from '~/data-provider';

export default function ChatDisclaimer() {
  const { t } = useTranslation();
  const { data: config } = useGetStartupConfig();

  const key = config?.interface?.aiDisclaimer;
  if (!key?.trim()) {
    return null;
  }

  const text = t(key, { defaultValue: key });

  return (
    <div
      className="pointer-events-none flex select-none items-center justify-center px-6 pb-2 pt-1 text-center text-xs leading-normal text-gray-500 dark:text-gray-400"
      role="note"
      aria-label={text}
    >
      {text}
    </div>
  );
}
