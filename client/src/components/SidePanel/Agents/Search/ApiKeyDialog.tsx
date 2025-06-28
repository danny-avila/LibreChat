import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import * as Menu from '@ariakit/react/menu';
import { AuthType, SearchCategories, RerankerTypes } from 'librechat-data-provider';
import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { MenuItemProps } from '~/common';
import { Input, Button, OGDialog, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import DropdownPopup from '~/components/ui/DropdownPopup';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function ApiKeyDialog({
  isOpen,
  onSubmit,
  onRevoke,
  onOpenChange,
  authTypes,
  isToolAuthenticated,
  register,
  handleSubmit,
  triggerRef,
  triggerRefs,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SearchApiKeyFormData) => void;
  onRevoke: () => void;
  authTypes: [string, AuthType][];
  isToolAuthenticated: boolean;
  register: UseFormRegister<SearchApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<SearchApiKeyFormData>;
  triggerRef?: React.RefObject<HTMLInputElement | HTMLButtonElement>;
  triggerRefs?: React.RefObject<HTMLInputElement | HTMLButtonElement>[];
}) {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();
  const [selectedReranker, setSelectedReranker] = useState<
    RerankerTypes.JINA | RerankerTypes.COHERE
  >(
    config?.webSearch?.rerankerType === RerankerTypes.COHERE
      ? RerankerTypes.COHERE
      : RerankerTypes.JINA,
  );

  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [scraperDropdownOpen, setScraperDropdownOpen] = useState(false);
  const [rerankerDropdownOpen, setRerankerDropdownOpen] = useState(false);

  const providerItems: MenuItemProps[] = [
    {
      label: localize('com_ui_web_search_provider_serper'),
      onClick: () => {},
    },
  ];

  const scraperItems: MenuItemProps[] = [
    {
      label: localize('com_ui_web_search_scraper_firecrawl'),
      onClick: () => {},
    },
  ];

  const rerankerItems: MenuItemProps[] = [
    {
      label: localize('com_ui_web_search_reranker_jina'),
      onClick: () => setSelectedReranker(RerankerTypes.JINA),
    },
    {
      label: localize('com_ui_web_search_reranker_cohere'),
      onClick: () => setSelectedReranker(RerankerTypes.COHERE),
    },
  ];

  const showProviderDropdown = !config?.webSearch?.searchProvider;
  const showScraperDropdown = !config?.webSearch?.scraperType;
  const showRerankerDropdown = !config?.webSearch?.rerankerType;

  // Determine which categories are SYSTEM_DEFINED
  const providerAuthType = authTypes.find(([cat]) => cat === SearchCategories.PROVIDERS)?.[1];
  const scraperAuthType = authTypes.find(([cat]) => cat === SearchCategories.SCRAPERS)?.[1];
  const rerankerAuthType = authTypes.find(([cat]) => cat === SearchCategories.RERANKERS)?.[1];

  function renderRerankerInput() {
    if (config?.webSearch?.rerankerType === RerankerTypes.JINA) {
      return (
        <>
          <Input
            type="password"
            placeholder={localize('com_ui_web_search_jina_key')}
            autoComplete="one-time-code"
            readOnly={true}
            onFocus={(e) => (e.target.readOnly = false)}
            {...register('jinaApiKey')}
          />
          <div className="mt-1 text-xs text-text-secondary">
            <a
              href="https://jina.ai/api-dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {localize('com_ui_web_search_reranker_jina_key')}
            </a>
          </div>
        </>
      );
    }
    if (config?.webSearch?.rerankerType === RerankerTypes.COHERE) {
      return (
        <>
          <Input
            type="password"
            placeholder={localize('com_ui_web_search_cohere_key')}
            autoComplete="one-time-code"
            readOnly={true}
            onFocus={(e) => (e.target.readOnly = false)}
            {...register('cohereApiKey')}
          />
          <div className="mt-1 text-xs text-text-secondary">
            <a
              href="https://dashboard.cohere.com/welcome/login"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {localize('com_ui_web_search_reranker_cohere_key')}
            </a>
          </div>
        </>
      );
    }
    if (!config?.webSearch?.rerankerType && selectedReranker === RerankerTypes.JINA) {
      return (
        <>
          <Input
            type="password"
            placeholder={localize('com_ui_web_search_jina_key')}
            autoComplete="one-time-code"
            readOnly={true}
            onFocus={(e) => (e.target.readOnly = false)}
            {...register('jinaApiKey')}
          />
          <div className="mt-1 text-xs text-text-secondary">
            <a
              href="https://jina.ai/api-dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {localize('com_ui_web_search_reranker_jina_key')}
            </a>
          </div>
        </>
      );
    }
    if (!config?.webSearch?.rerankerType && selectedReranker === RerankerTypes.COHERE) {
      return (
        <>
          <Input
            type="password"
            placeholder={localize('com_ui_web_search_cohere_key')}
            autoComplete="one-time-code"
            readOnly={true}
            onFocus={(e) => (e.target.readOnly = false)}
            {...register('cohereApiKey')}
          />
          <div className="mt-1 text-xs text-text-secondary">
            <a
              href="https://dashboard.cohere.com/welcome/login"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {localize('com_ui_web_search_reranker_cohere_key')}
            </a>
          </div>
        </>
      );
    }
    return null;
  }

  return (
    <OGDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      triggerRefs={triggerRefs}
    >
      <OGDialogTemplate
        className="w-11/12 sm:w-[500px]"
        title=""
        main={
          <>
            <div className="mb-4 text-center font-medium">{localize('com_ui_web_search')}</div>
            <div className="mb-4 text-center text-sm">
              {localize('com_ui_web_search_api_subtitle')}
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Search Provider Section */}
              {providerAuthType !== AuthType.SYSTEM_DEFINED && (
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-md w-fit font-medium">
                      {localize('com_ui_web_search_provider')}
                    </Label>
                    {showProviderDropdown ? (
                      <DropdownPopup
                        menuId="search-provider-dropdown"
                        items={providerItems}
                        isOpen={providerDropdownOpen}
                        setIsOpen={setProviderDropdownOpen}
                        trigger={
                          <Menu.MenuButton
                            onClick={() => setProviderDropdownOpen(!providerDropdownOpen)}
                            className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary"
                          >
                            {localize('com_ui_web_search_provider_serper')}
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Menu.MenuButton>
                        }
                      />
                    ) : (
                      <div className="text-sm text-text-secondary">
                        {localize('com_ui_web_search_provider_serper')}
                      </div>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder={`${localize('com_ui_enter_api_key')}`}
                    autoComplete="one-time-code"
                    readOnly={true}
                    onFocus={(e) => (e.target.readOnly = false)}
                    {...register('serperApiKey', { required: true })}
                  />
                  <div className="mt-1 text-xs text-text-secondary">
                    <a
                      href="https://serper.dev/api-key"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {localize('com_ui_web_search_provider_serper_key')}
                    </a>
                  </div>
                </div>
              )}

              {/* Scraper Section */}
              {scraperAuthType !== AuthType.SYSTEM_DEFINED && (
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-md w-fit font-medium">
                      {localize('com_ui_web_search_scraper')}
                    </Label>
                    {showScraperDropdown ? (
                      <DropdownPopup
                        menuId="scraper-dropdown"
                        items={scraperItems}
                        isOpen={scraperDropdownOpen}
                        setIsOpen={setScraperDropdownOpen}
                        trigger={
                          <Menu.MenuButton
                            onClick={() => setScraperDropdownOpen(!scraperDropdownOpen)}
                            className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary"
                          >
                            {localize('com_ui_web_search_scraper_firecrawl')}
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Menu.MenuButton>
                        }
                      />
                    ) : (
                      <div className="text-sm text-text-secondary">
                        {localize('com_ui_web_search_scraper_firecrawl')}
                      </div>
                    )}
                  </div>
                  <Input
                    type="password"
                    placeholder={`${localize('com_ui_enter_api_key')}`}
                    autoComplete="one-time-code"
                    readOnly={true}
                    onFocus={(e) => (e.target.readOnly = false)}
                    className="mb-2"
                    {...register('firecrawlApiKey')}
                  />
                  <Input
                    type="text"
                    placeholder={localize('com_ui_web_search_firecrawl_url')}
                    className="mb-1"
                    {...register('firecrawlApiUrl')}
                  />
                  <div className="mt-1 text-xs text-text-secondary">
                    <a
                      href="https://docs.firecrawl.dev/introduction#api-key"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {localize('com_ui_web_search_scraper_firecrawl_key')}
                    </a>
                  </div>
                </div>
              )}

              {/* Reranker Section */}
              {rerankerAuthType !== AuthType.SYSTEM_DEFINED && (
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-md w-fit font-medium">
                      {localize('com_ui_web_search_reranker')}
                    </Label>
                    {showRerankerDropdown && (
                      <DropdownPopup
                        menuId="reranker-dropdown"
                        isOpen={rerankerDropdownOpen}
                        setIsOpen={setRerankerDropdownOpen}
                        items={rerankerItems}
                        trigger={
                          <Menu.MenuButton
                            onClick={() => setRerankerDropdownOpen(!rerankerDropdownOpen)}
                            className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary"
                          >
                            {selectedReranker === RerankerTypes.JINA
                              ? localize('com_ui_web_search_reranker_jina')
                              : localize('com_ui_web_search_reranker_cohere')}
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Menu.MenuButton>
                        }
                      />
                    )}
                    {!showRerankerDropdown && (
                      <div className="text-sm text-text-secondary">
                        {config?.webSearch?.rerankerType === RerankerTypes.COHERE
                          ? localize('com_ui_web_search_reranker_cohere')
                          : localize('com_ui_web_search_reranker_jina')}
                      </div>
                    )}
                  </div>
                  {renderRerankerInput()}
                </div>
              )}
            </form>
          </>
        }
        selection={{
          selectHandler: handleSubmit(onSubmit),
          selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
          selectText: localize('com_ui_save'),
        }}
        buttons={
          isToolAuthenticated && (
            <Button
              onClick={onRevoke}
              className="bg-destructive text-white transition-all duration-200 hover:bg-destructive/80"
            >
              {localize('com_ui_revoke')}
            </Button>
          )
        }
        showCancelButton={true}
      />
    </OGDialog>
  );
}
