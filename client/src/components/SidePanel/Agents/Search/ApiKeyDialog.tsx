import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import * as Menu from '@ariakit/react/menu';
import { AuthType } from 'librechat-data-provider';
import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { MenuItemProps } from '~/common';
import { Input, Button, OGDialog, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import DropdownPopup from '~/components/ui/DropdownPopup';
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
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SearchApiKeyFormData) => void;
  onRevoke: () => void;
  authTypes: [string, AuthType][];
  isToolAuthenticated: boolean;
  register: UseFormRegister<SearchApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<SearchApiKeyFormData>;
  triggerRef?: React.RefObject<HTMLInputElement>;
}) {
  const localize = useLocalize();
  const [selectedReranker, setSelectedReranker] = useState<'jina' | 'cohere'>('jina');

  // Dropdown open states
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [scraperDropdownOpen, setScraperDropdownOpen] = useState(false);
  const [rerankerDropdownOpen, setRerankerDropdownOpen] = useState(false);

  // Dropdown items
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
      onClick: () => setSelectedReranker('jina'),
    },
    {
      label: localize('com_ui_web_search_reranker_cohere'),
      onClick: () => setSelectedReranker('cohere'),
    },
  ];

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange} triggerRef={triggerRef}>
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
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md w-fit font-medium">
                    {localize('com_ui_web_search_provider')}
                  </Label>
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

              {/* Scraper Section */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md w-fit font-medium">
                    {localize('com_ui_web_search_scraper')}
                  </Label>
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

              {/* Reranker Section */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md w-fit font-medium">
                    {localize('com_ui_web_search_reranker')}
                  </Label>
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
                        {selectedReranker === 'jina'
                          ? localize('com_ui_web_search_reranker_jina')
                          : localize('com_ui_web_search_reranker_cohere')}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Menu.MenuButton>
                    }
                  />
                </div>
                {selectedReranker === 'jina' ? (
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
                ) : (
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
                )}
              </div>
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
