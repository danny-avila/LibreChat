import { useState } from 'react';
import { Globe } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogFooter,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import {
  AuthType,
  RerankerTypes,
  SearchProviders,
  ScraperProviders,
  SearchCategories,
} from 'librechat-data-provider';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import InputSection, { type DropdownOption } from './InputSection';
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

  const [selectedProvider, setSelectedProvider] = useState(
    config?.webSearch?.searchProvider || SearchProviders.SERPER,
  );
  const [selectedReranker, setSelectedReranker] = useState(
    config?.webSearch?.rerankerType || RerankerTypes.JINA,
  );
  const [selectedScraper, setSelectedScraper] = useState(
    config?.webSearch?.scraperProvider || ScraperProviders.FIRECRAWL,
  );

  const providerOptions: DropdownOption[] = [
    {
      key: SearchProviders.SERPER,
      label: localize('com_ui_web_search_provider_serper'),
      inputs: {
        serperApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://serper.dev/api-keys',
            text: localize('com_ui_web_search_provider_serper_key'),
          },
        },
      },
    },
    {
      key: SearchProviders.SEARXNG,
      label: localize('com_ui_web_search_provider_searxng'),
      inputs: {
        searxngInstanceUrl: {
          placeholder: localize('com_ui_web_search_searxng_instance_url'),
          type: 'text' as const,
        },
        searxngApiKey: {
          placeholder: localize('com_ui_web_search_searxng_api_key'),
          type: 'password' as const,
        },
      },
    },
  ];

  const rerankerOptions: DropdownOption[] = [
    {
      key: RerankerTypes.JINA,
      label: localize('com_ui_web_search_reranker_jina'),
      inputs: {
        jinaApiKey: {
          placeholder: localize('com_ui_web_search_jina_key'),
          type: 'password' as const,
          link: {
            url: 'https://jina.ai/api-dashboard/',
            text: localize('com_ui_web_search_reranker_jina_key'),
          },
        },
        jinaApiUrl: {
          placeholder: localize('com_ui_web_search_jina_url'),
          type: 'text' as const,
          link: {
            url: 'https://api.jina.ai/v1/rerank',
            text: localize('com_ui_web_search_reranker_jina_url_help'),
          },
        },
      },
    },
    {
      key: RerankerTypes.COHERE,
      label: localize('com_ui_web_search_reranker_cohere'),
      inputs: {
        cohereApiKey: {
          placeholder: localize('com_ui_web_search_cohere_key'),
          type: 'password' as const,
          link: {
            url: 'https://dashboard.cohere.com/welcome/login',
            text: localize('com_ui_web_search_reranker_cohere_key'),
          },
        },
      },
    },
  ];

  const scraperOptions: DropdownOption[] = [
    {
      key: ScraperProviders.FIRECRAWL,
      label: localize('com_ui_web_search_scraper_firecrawl'),
      inputs: {
        firecrawlApiUrl: {
          placeholder: localize('com_ui_web_search_firecrawl_url'),
          type: 'text' as const,
        },
        firecrawlApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://docs.firecrawl.dev/introduction#api-key',
            text: localize('com_ui_web_search_scraper_firecrawl_key'),
          },
        },
      },
    },
    {
      key: ScraperProviders.SERPER,
      label: localize('com_ui_web_search_scraper_serper'),
      inputs: {
        serperApiKey: {
          placeholder: localize('com_ui_enter_api_key'),
          type: 'password' as const,
          link: {
            url: 'https://serper.dev/api-keys',
            text: localize('com_ui_web_search_scraper_serper_key'),
          },
        },
      },
    },
  ];

  const [dropdownOpen, setDropdownOpen] = useState({
    provider: false,
    reranker: false,
    scraper: false,
  });

  const providerAuthType = authTypes.find(([cat]) => cat === SearchCategories.PROVIDERS)?.[1];
  const scraperAuthType = authTypes.find(([cat]) => cat === SearchCategories.SCRAPERS)?.[1];
  const rerankerAuthType = authTypes.find(([cat]) => cat === SearchCategories.RERANKERS)?.[1];

  const handleProviderChange = (key: string) => {
    setSelectedProvider(key as SearchProviders);
  };

  const handleRerankerChange = (key: string) => {
    setSelectedReranker(key as RerankerTypes);
  };

  const handleScraperChange = (key: string) => {
    setSelectedScraper(key as ScraperProviders);
  };

  return (
    <OGDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      triggerRefs={triggerRefs}
    >
      <OGDialogContent
        showCloseButton={false}
        className="w-11/12 max-w-lg border-none bg-surface-primary"
      >
        <OGDialogHeader className="gap-2 py-2">
          <div className="flex items-center justify-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-blue-500/10">
              <Globe className="size-5 text-blue-500" aria-hidden="true" />
            </div>
          </div>
          <OGDialogTitle className="text-center text-lg font-semibold">
            {localize('com_ui_web_search')}
          </OGDialogTitle>
        </OGDialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {providerAuthType !== AuthType.SYSTEM_DEFINED && (
            <InputSection
              title={localize('com_ui_web_search_provider')}
              selectedKey={selectedProvider}
              onSelectionChange={handleProviderChange}
              dropdownOptions={providerOptions}
              showDropdown={!config?.webSearch?.searchProvider}
              register={register}
              dropdownOpen={dropdownOpen.provider}
              setDropdownOpen={(open) => setDropdownOpen((prev) => ({ ...prev, provider: open }))}
              dropdownKey="provider"
            />
          )}

          {scraperAuthType !== AuthType.SYSTEM_DEFINED && (
            <InputSection
              title={localize('com_ui_web_search_scraper')}
              selectedKey={selectedScraper}
              onSelectionChange={handleScraperChange}
              dropdownOptions={scraperOptions}
              showDropdown={!config?.webSearch?.scraperProvider}
              register={register}
              dropdownOpen={dropdownOpen.scraper}
              setDropdownOpen={(open) => setDropdownOpen((prev) => ({ ...prev, scraper: open }))}
              dropdownKey="scraper"
            />
          )}

          {rerankerAuthType !== AuthType.SYSTEM_DEFINED && (
            <InputSection
              title={localize('com_ui_web_search_reranker')}
              selectedKey={selectedReranker}
              onSelectionChange={handleRerankerChange}
              dropdownOptions={rerankerOptions}
              showDropdown={!config?.webSearch?.rerankerType}
              register={register}
              dropdownOpen={dropdownOpen.reranker}
              setDropdownOpen={(open) => setDropdownOpen((prev) => ({ ...prev, reranker: open }))}
              dropdownKey="reranker"
            />
          )}
        </form>

        <OGDialogFooter>
          <OGDialogClose asChild>
            <Button variant="outline" className="h-10">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          {isToolAuthenticated && (
            <Button
              variant="destructive"
              onClick={onRevoke}
              className="h-10"
              aria-label={localize('com_ui_revoke')}
            >
              {localize('com_ui_revoke')}
            </Button>
          )}
          <Button variant="submit" onClick={handleSubmit(onSubmit)} className="h-10">
            {localize('com_ui_save')}
          </Button>
        </OGDialogFooter>
      </OGDialogContent>
    </OGDialog>
  );
}
