import { useState } from 'react';
import {
  AuthType,
  SearchCategories,
  RerankerTypes,
  SearchProviders,
  ScraperTypes,
} from 'librechat-data-provider';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';
import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import InputSection, { type DropdownOption } from './InputSection';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { Button, OGDialog } from '~/components/ui';
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
  const [selectedScraper, setSelectedScraper] = useState(ScraperTypes.FIRECRAWL);

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
      key: ScraperTypes.FIRECRAWL,
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
    setSelectedScraper(key as ScraperTypes);
  };

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
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Provider Section */}
              {providerAuthType !== AuthType.SYSTEM_DEFINED && (
                <InputSection
                  title={localize('com_ui_web_search_provider')}
                  selectedKey={selectedProvider}
                  onSelectionChange={handleProviderChange}
                  dropdownOptions={providerOptions}
                  showDropdown={!config?.webSearch?.searchProvider}
                  register={register}
                  dropdownOpen={dropdownOpen.provider}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, provider: open }))
                  }
                  dropdownKey="provider"
                />
              )}

              {/* Scraper Section */}
              {scraperAuthType !== AuthType.SYSTEM_DEFINED && (
                <InputSection
                  title={localize('com_ui_web_search_scraper')}
                  selectedKey={selectedScraper}
                  onSelectionChange={handleScraperChange}
                  dropdownOptions={scraperOptions}
                  showDropdown={!config?.webSearch?.scraperType}
                  register={register}
                  dropdownOpen={dropdownOpen.scraper}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, scraper: open }))
                  }
                  dropdownKey="scraper"
                />
              )}

              {/* Reranker Section */}
              {rerankerAuthType !== AuthType.SYSTEM_DEFINED && (
                <InputSection
                  title={localize('com_ui_web_search_reranker')}
                  selectedKey={selectedReranker}
                  onSelectionChange={handleRerankerChange}
                  dropdownOptions={rerankerOptions}
                  showDropdown={!config?.webSearch?.rerankerType}
                  register={register}
                  dropdownOpen={dropdownOpen.reranker}
                  setDropdownOpen={(open) =>
                    setDropdownOpen((prev) => ({ ...prev, reranker: open }))
                  }
                  dropdownKey="reranker"
                />
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
            <Button onClick={onRevoke} className="bg-red-500 text-white hover:bg-red-600">
              {localize('com_ui_revoke')}
            </Button>
          )
        }
        showCancelButton={true}
      />
    </OGDialog>
  );
}
