import { useLocalize } from '~/hooks';

export default function Footer() {
  const localize = useLocalize();

  return (
    <div className="hidden px-3 pb-1 pt-2 text-center text-xs text-black/50 dark:text-white/50 md:block md:px-4 md:pb-4 md:pt-3">
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
    </div>
  );
}
