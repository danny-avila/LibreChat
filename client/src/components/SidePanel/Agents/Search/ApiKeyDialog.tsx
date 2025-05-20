import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import type { WebSearchApiKeyFormData } from '~/hooks/Plugins/useWebSearchApiKeyForm';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { Input, Button, OGDialog, Label } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { ChevronDown } from 'lucide-react';

export default function ApiKeyDialog({
  isOpen,
  onSubmit,
  onRevoke,
  onOpenChange,
  isUserProvided,
  isToolAuthenticated,
  register,
  handleSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WebSearchApiKeyFormData) => void;
  onRevoke: () => void;
  isUserProvided: boolean;
  isToolAuthenticated: boolean;
  register: UseFormRegister<WebSearchApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<WebSearchApiKeyFormData>;
}) {
  const localize = useLocalize();

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
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
              {/* Search Engine Section */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md font-medium">
                    {localize('com_ui_web_search_engine')}
                  </Label>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      disabled
                      className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary opacity-70"
                    >
                      {localize('com_ui_web_search_engine_serper')}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  </div>
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
                    {localize('com_ui_web_search_engine_serper_key')}
                  </a>
                </div>
              </div>

              {/* Scraper Section */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md font-medium">
                    {localize('com_ui_web_search_scraper')}
                  </Label>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      disabled
                      className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary opacity-70"
                    >
                      {localize('com_ui_web_search_scraper_firecrawl')}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  </div>
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
              </div>

              {/* Reranker Section */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-md font-medium">
                    {localize('com_ui_web_search_reranker')}
                  </Label>
                  <div className="relative inline-block">
                    <button
                      type="button"
                      disabled
                      className="flex items-center rounded-md border border-border-light px-3 py-1 text-sm text-text-secondary opacity-70"
                    >
                      {localize('com_ui_web_search_reranker_jina_cohere')}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </button>
                  </div>
                </div>
                <Input
                  type="password"
                  placeholder={localize('com_ui_web_search_jina_key')}
                  autoComplete="one-time-code"
                  readOnly={true}
                  onFocus={(e) => (e.target.readOnly = false)}
                  className="mb-2"
                  {...register('jinaApiKey')}
                />
                <Input
                  type="password"
                  placeholder={localize('com_ui_web_search_cohere_key')}
                  autoComplete="one-time-code"
                  readOnly={true}
                  onFocus={(e) => (e.target.readOnly = false)}
                  {...register('cohereApiKey')}
                />
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
          isUserProvided &&
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
