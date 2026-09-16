import { useAtomValue } from 'jotai';
import { Dropdown, Spinner } from '@librechat/client';
import { languageOptions } from '~/locales/i18n';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type PortalElement = ((element: HTMLElement) => HTMLElement | null) | HTMLElement | null;

export const ThemeSelector = ({
  theme,
  onChange,
  portal = true,
  portalElement,
  popoverClassName,
}: {
  theme: string;
  onChange: (value: string) => void;
  portal?: boolean;
  portalElement?: PortalElement;
  popoverClassName?: string;
}) => {
  const localize = useLocalize();

  const themeOptions = [
    { value: 'system', label: localize('com_nav_theme_system') },
    { value: 'dark', label: localize('com_nav_theme_dark') },
    { value: 'light', label: localize('com_nav_theme_light') },
    { value: 'high-contrast-light', label: localize('com_nav_theme_high_contrast_light') },
    { value: 'high-contrast-dark', label: localize('com_nav_theme_high_contrast_dark') },
  ];

  const labelId = 'theme-selector-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_theme')}</div>

      <Dropdown
        value={theme}
        onChange={onChange}
        options={themeOptions}
        sizeClasses={cn('z-50 w-[180px]', popoverClassName)}
        testId="theme-selector"
        aria-labelledby={labelId}
        portal={portal}
        portalElement={portalElement}
      />
    </div>
  );
};

export const LangSelector = ({
  langcode,
  onChange,
  portal = true,
  portalElement,
  popoverClassName,
}: {
  langcode: string;
  onChange: (value: string) => void;
  portal?: boolean;
  portalElement?: PortalElement;
  popoverClassName?: string;
}) => {
  const localize = useLocalize();
  const isLanguageLoading = useAtomValue(store.languageLoading);

  const languageSelectOptions = languageOptions.map(({ value, labelKey }) => ({
    value,
    label: localize(labelKey),
  }));

  const labelId = 'language-selector-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_language')}</div>

      <div className="flex items-center gap-2">
        {isLanguageLoading && (
          <span
            role="status"
            aria-label={localize('com_ui_loading')}
            className="flex size-5 items-center justify-center text-text-secondary"
          >
            <Spinner className="size-4" />
          </span>
        )}
        <Dropdown
          value={langcode}
          onChange={onChange}
          sizeClasses={cn('z-50 w-[220px]', popoverClassName)}
          options={languageSelectOptions}
          aria-labelledby={labelId}
          portal={portal}
          portalElement={portalElement}
          searchable
          searchPlaceholder={localize('com_ui_search_language')}
          searchEmptyText={localize('com_ui_no_results_found')}
        />
      </div>
    </div>
  );
};
