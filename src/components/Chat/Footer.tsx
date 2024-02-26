import { useLocalize } from '~/hooks';

export default function Footer() {
  const localize = useLocalize();
  return (
    <div className="relative px-2 py-2 text-center text-xs text-gray-600 dark:text-gray-300 md:px-[60px]">
      <span>
        <>
          <a
            href="https://github.com/danny-avila/LibreChat"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Vera AI v0.6.6
          </a>
          {' - '} {localize('com_ui_new_footer')}
        </>
      </span>
    </div>
  );
}
