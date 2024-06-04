import { Constants } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useLocalize } from '~/hooks';
import ReactMarkdown from 'react-markdown';

export default function Footer() {
  const { data: config } = useGetStartupConfig();
  const localize = useLocalize();

  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
      <ReactMarkdown
        components={{
          a: (props) => {
            const { ['node']: _, href, ...otherProps } = props;
            return (
              <a
                className=" text-gray-600 underline dark:text-gray-300"
                href={href}
                target="_blank"
                rel="noreferrer"
                {...otherProps}
              />
            );
          },
        }}
      >
        {typeof config?.customFooter === 'string'
          ? config.customFooter
          : `[<${config?.appTitle || 'LibreChat'} ${
            Constants.VERSION
          }>](https://librechat.ai) - ${localize('com_ui_pay_per_call')}`}
      </ReactMarkdown>
    </div>
  );
}
