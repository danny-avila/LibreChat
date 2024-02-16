import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useLocalize } from '~/hooks';

export default function Footer() {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();
  return (
    <div className="relative px-2 py-2 text-center text-xs text-gray-600 dark:text-gray-300 md:px-[60px]">
      <span>
        {typeof config?.customFooter === 'string' ? (
          config.customFooter
        ) : (
          <>
            <a
              href="https://github.com/danny-avila/LibreChat"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {config?.appTitle || 'LibreChat'} v0.6.10
            </a>
            {' - '} {localize('com_ui_new_footer')}
          </>
        )}
      </span>
    </div>
  );
}
