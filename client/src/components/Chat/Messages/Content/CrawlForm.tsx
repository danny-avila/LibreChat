import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Label, TextareaAutosize } from '@librechat/client';
import { Database, Globe, Calendar, FileText, CheckCircle } from 'lucide-react';
import { useAuthContext } from '~/hooks';

interface CrawlFormData {
  website_id: string;
  launch_date: string;
  description: string;
  crawl_config_id: string;
}

interface WebsiteOption {
  id: string;
  name: string;
  url: string;
}

interface CrawlConfigOption {
  id: string;
  name: string;
  description?: string;
}

interface PrefilledParams {
  website_id?: string;
  launch_date?: string;
  description?: string;
  crawl_config_id?: string;
}

interface CrawlFormProps {
  onSubmit?: (data: CrawlFormData & { toolResponse?: any }) => void;
  onCancel?: () => void;
  websiteOptions?: WebsiteOption[];
  crawlConfigOptions?: CrawlConfigOption[];
  prefilledParams?: PrefilledParams;
  serverName?: string;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: CrawlFormData & {
    websiteLabel?: string;
    crawlConfigLabel?: string;
  };
}

const CrawlForm: React.FC<CrawlFormProps> = ({
  onSubmit,
  onCancel,
  websiteOptions = [],
  crawlConfigOptions = [],
  prefilledParams = {},
  serverName = '',
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const { token } = useAuthContext();
  const [formData, setFormData] = useState<CrawlFormData>({
    website_id: '',
    launch_date: '',
    description: '',
    crawl_config_id: 'default', // Default selection
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate form from prefilledParams with validation
  useEffect(() => {
    if (prefilledParams && Object.keys(prefilledParams).length > 0) {
      setFormData((prev) => {
        const updates: Partial<CrawlFormData> = {};

        // Only set website_id if it exists in options
        if (prefilledParams.website_id) {
          const websiteExists = websiteOptions.some((w) => w.id === prefilledParams.website_id);
          if (websiteExists) {
            updates.website_id = prefilledParams.website_id;
          } else {
            console.warn(
              `⚠️ Prefilled website_id "${prefilledParams.website_id}" not found in available options`,
            );
          }
        }

        // Only set crawl_config_id if it's 'default' or exists in options
        if (prefilledParams.crawl_config_id) {
          const configExists =
            prefilledParams.crawl_config_id === 'default' ||
            crawlConfigOptions.some((c) => c.id === prefilledParams.crawl_config_id);
          if (configExists) {
            updates.crawl_config_id = prefilledParams.crawl_config_id;
          } else {
            console.warn(
              `⚠️ Prefilled crawl_config_id "${prefilledParams.crawl_config_id}" not found in available options`,
            );
          }
        }

        // These are free-form, so always set if provided
        if (prefilledParams.launch_date) {
          updates.launch_date = prefilledParams.launch_date;
        }
        if (prefilledParams.description) {
          updates.description = prefilledParams.description;
        }

        return { ...prev, ...updates };
      });
    }
  }, [prefilledParams, websiteOptions, crawlConfigOptions]);

  const handleInputChange = useCallback((field: keyof CrawlFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (
        !formData.website_id ||
        !formData.launch_date ||
        !formData.description ||
        !formData.crawl_config_id
      ) {
        return;
      }

      setIsSubmitting(true);

      try {
        const toolId = `create_new_crawl_operation_mcp_${serverName}`;

        const payload = {
          website_id: formData.website_id,
          launch_date: formData.launch_date,
          description: formData.description,
          crawl_config_id: formData.crawl_config_id,
        };

        console.log('🔍 Calling create_new_crawl_operation tool:', {
          toolId,
          payload,
        });

        const response = await fetch(`/api/agents/tools/${encodeURIComponent(toolId)}/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ HTTP error response:', {
            status: response.status,
            statusText: response.statusText,
            errorBody: errorText,
          });
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ MCP tool response:', result);

        onSubmit?.({ ...formData, toolResponse: result });
      } catch (error) {
        console.error('❌ Error calling MCP tool:', error);
        onSubmit?.({
          ...formData,
          toolResponse: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onSubmit, serverName, token],
  );

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const isValid =
    formData.website_id && formData.launch_date && formData.description && formData.crawl_config_id;

  // If form is cancelled, show cancelled state
  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              Crawl Configuration Cancelled
            </h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            The crawl configuration form was cancelled.
          </p>
        </div>
      </div>
    );
  }

  // If form is submitted, show the form with disabled fields and green outline
  if (isSubmitted && submittedData) {
    const website = websiteOptions.find((w) => w.id === submittedData.website_id);
    const websiteLabel = website ? `${website.name}` : submittedData.website_id;

    const crawlConfig = crawlConfigOptions.find((c) => c.id === submittedData.crawl_config_id);
    const crawlConfigLabel = crawlConfig
      ? crawlConfig.name
      : submittedData.crawl_config_id === 'default'
        ? 'Default Configuration'
        : submittedData.crawl_config_id;

    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-4 shadow-lg">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-400">Crawl Configuration Submitted</h3>
          </div>
          <p className="text-sm text-green-300">
            The crawl configuration has been submitted successfully.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Website</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <Globe className="h-4 w-4" />
              <span>{websiteLabel}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Crawl Configuration</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <Database className="h-4 w-4" />
              <span>{crawlConfigLabel}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Launch Date</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <Calendar className="h-4 w-4" />
              <span>{submittedData.launch_date}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-white">Description</Label>
            <div className="flex items-center gap-2 rounded-md border border-green-500 bg-gray-700 px-3 py-2 text-white opacity-75">
              <FileText className="h-4 w-4" />
              <span>{submittedData.description}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-4 shadow-lg">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Website Crawl Configuration</h3>
        </div>
        <p className="text-sm text-gray-300">
          Please provide the details for the website crawl.
          {websiteOptions.length > 0 &&
            ` Select from ${websiteOptions.length} available website${websiteOptions.length > 1 ? 's' : ''}.`}{' '}
          Chat is disabled until you submit or cancel this form.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Website Selector */}
        <div>
          <Label htmlFor="website_id" className="mb-2 block text-sm font-medium text-white">
            Website
          </Label>
          <select
            id="website_id"
            value={formData.website_id}
            onChange={(e) => handleInputChange('website_id', e.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a website...</option>
            {websiteOptions.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name}
              </option>
            ))}
          </select>
        </div>

        {/* Crawl Configuration Selector */}
        <div>
          <Label htmlFor="crawl_config_id" className="mb-2 block text-sm font-medium text-white">
            Crawl Configuration
          </Label>
          <select
            id="crawl_config_id"
            value={formData.crawl_config_id}
            onChange={(e) => handleInputChange('crawl_config_id', e.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="default">Default Configuration</option>
            {crawlConfigOptions.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
                {config.description && ` - ${config.description}`}
              </option>
            ))}
          </select>
        </div>

        {/* Launch Date Picker (changed from datetime-local to date) */}
        <div>
          <Label htmlFor="launch_date" className="mb-2 block text-sm font-medium text-white">
            Launch Date
          </Label>
          <Input
            id="launch_date"
            type="date"
            value={formData.launch_date}
            onChange={(e) => handleInputChange('launch_date', e.target.value)}
            className="w-full border-gray-600 bg-gray-700 text-white"
            required
          />
        </div>

        {/* Description Text Field */}
        <div>
          <Label htmlFor="description" className="mb-2 block text-sm font-medium text-white">
            Description
          </Label>
          <TextareaAutosize
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Describe what you want to crawl..."
            minRows={3}
            maxRows={6}
            className="w-full resize-none border-gray-600 bg-gray-700 text-white placeholder-gray-400"
            aria-label="Description"
            required
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={handleCancel}
            variant="outline"
            className="flex-1 border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Creating Crawl...
              </span>
            ) : (
              'Create Crawl Operation'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CrawlForm;
