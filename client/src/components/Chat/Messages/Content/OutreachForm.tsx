import React, { useState, useCallback } from 'react';
import { Button, Label } from '@librechat/client';
import {
  User,
  Users,
  Mail,
  FileText,
  Check,
  ChevronRight,
  Loader2,
  Search,
  Target,
} from 'lucide-react';
import { useAuthContext } from '~/hooks';

interface SenderOption {
  id: string;
  name: string;
  occupation: string | null;
  company_name: string;
  sender_group_id: string;
}

interface ListOption {
  id: string;
  list_name: string;
  leads_count: number;
}

interface CampaignOption {
  id: string;
  name: string;
  campaign_goal?: string;
  description?: string;
}

interface TemplateOption {
  id: string;
  name: string;
  subject_line?: string;
  body?: string;
}

interface ICPOption {
  element_id: string;
  title: string;
  manual_query?: string;
  target_industry?: string[];
  target_level?: string[];
  target_dept?: string[];
}

interface PersonOption {
  element_id: string;
  name: string;
  linkedin_url: string;
  industry?: string[];
  job_titles?: string[];
  company?: string;
  score?: string;
}

interface OutreachFormData {
  sender_id: string;
  sender_group_id: string;
  list_id?: string;
  icp_id?: string;
  campaign_id: string;
  template_id: string;
  selected_people?: string[]; // Array of element_ids for ICP matches
  manual_urls?: string; // Newline-separated LinkedIn URLs
  audience_type?: 'existing' | 'manual'; // Track which audience option was selected
}

interface OutreachFormProps {
  onSubmit?: (data: OutreachFormData) => void;
  onCancel?: () => void;
  senderOptions?: SenderOption[];
  listOptions?: ListOption[];
  campaignOptions?: CampaignOption[];
  templateOptions?: TemplateOption[];
  icpOptions?: ICPOption[];
  serverName?: string;
  isSubmitted?: boolean;
  isCancelled?: boolean;
  submittedData?: OutreachFormData & {
    senderLabel?: string;
    listLabel?: string;
    icpLabel?: string;
    campaignLabel?: string;
    templateLabel?: string;
    peopleCount?: number;
  };
}

const OutreachForm: React.FC<OutreachFormProps> = ({
  onSubmit,
  onCancel,
  senderOptions = [],
  listOptions = [],
  campaignOptions = [],
  templateOptions = [],
  icpOptions = [],
  serverName = '',
  isSubmitted = false,
  isCancelled = false,
  submittedData,
}) => {
  const [currentStep, setCurrentStep] = useState<'sender' | 'audience' | 'campaign'>('sender');
  const [audienceOption, setAudienceOption] = useState<'existing' | 'manual'>('existing');
  const [selectedIcp, setSelectedIcp] = useState<ICPOption | null>(null);
  const [searchResults, setSearchResults] = useState<PersonOption[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<PersonOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualUrls, setManualUrls] = useState('');

  const [formData, setFormData] = useState<OutreachFormData>({
    sender_id: '',
    sender_group_id: '',
    list_id: '',
    icp_id: '',
    campaign_id: '',
    template_id: '',
    selected_people: [],
    manual_urls: '',
    audience_type: 'existing',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hook for authentication (needed for API calls)
  const { token } = useAuthContext();

  // Debug logging
  React.useEffect(() => {
    console.log('📋 OutreachForm received options:', {
      senders: senderOptions.length,
      lists: listOptions.length,
      campaigns: campaignOptions.length,
      templates: templateOptions.length,
      icps: icpOptions.length,
      senderOptions,
      listOptions,
      campaignOptions,
      templateOptions,
      icpOptions,
    });
  }, [senderOptions, listOptions, campaignOptions, templateOptions, icpOptions]);

  // Group senders by company
  const groupedSenders = senderOptions.reduce(
    (acc, sender) => {
      const company = sender.company_name;
      if (!acc[company]) {
        acc[company] = [];
      }
      acc[company].push(sender);
      return acc;
    },
    {} as Record<string, SenderOption[]>,
  );

  const handleFieldChange = useCallback((field: keyof OutreachFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle sender selection - set both sender_id and sender_group_id
  const handleSenderSelect = useCallback((sender: SenderOption) => {
    setFormData((prev) => ({
      ...prev,
      sender_id: sender.id,
      sender_group_id: sender.sender_group_id,
    }));
  }, []);

  // Handle ICP search - directly calls the MCP tool via API
  const handleSearchIcp = useCallback(async () => {
    if (!formData.list_id || !formData.icp_id) {
      console.warn('⚠️ List or ICP not selected');
      return;
    }

    if (!token) {
      console.error('❌ No authentication token available');
      return;
    }

    setSearching(true);

    // Construct the MCP tool ID - the server name is already baked into the tool name
    const toolId = `get_icp_recommendations_mcp_${serverName}`;

    console.log('🔍 Triggering get_icp_recommendations MCP tool:', {
      toolId,
      icpId: formData.icp_id,
      uploadListId: formData.list_id,
    });

    try {
      // Make direct API call to trigger the MCP tool
      // No messageId required for MCP tools after backend modification
      // Arguments are sent at the top level of the request body
      const response = await fetch(`/api/agents/tools/${encodeURIComponent(toolId)}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          icpId: formData.icp_id,
          uploadListId: formData.list_id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ MCP tool response:', data);

      // Parse the response - the result should be in data.result
      let peopleResults: PersonOption[] = [];

      if (data.result) {
        try {
          // The result might be a string that needs parsing
          const parsedResult =
            typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

          // Handle array format
          if (Array.isArray(parsedResult)) {
            peopleResults = parsedResult;
          }

          console.log('📊 Parsed people results:', peopleResults);
          setSearchResults(peopleResults);
        } catch (parseError) {
          console.error('❌ Error parsing MCP tool results:', parseError);
          console.error('Raw result:', data.result);
        }
      }

      if (peopleResults.length === 0) {
        console.warn('⚠️ No people found in results');
      }
    } catch (error) {
      console.error('❌ Error calling MCP tool:', error);
    } finally {
      setSearching(false);
    }
  }, [formData.list_id, formData.icp_id, serverName, token]);

  // Toggle person selection
  const togglePersonSelection = useCallback((person: PersonOption) => {
    setSelectedPeople((prev) => {
      const isSelected = prev.find((p) => p.element_id === person.element_id);
      if (isSelected) {
        return prev.filter((p) => p.element_id !== person.element_id);
      } else {
        return [...prev, person];
      }
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const hasValidAudience =
      audienceOption === 'existing' ? selectedPeople.length > 0 : manualUrls.trim() !== '';

    if (
      !formData.sender_id ||
      !hasValidAudience ||
      !formData.campaign_id ||
      !formData.template_id
    ) {
      return;
    }

    if (!token) {
      console.error('❌ No authentication token available');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare the identifier array based on audience type
      let identifier: string[] = [];
      let identifier_type: 'ELEMENT_ID' | 'LINKEDIN_URL';

      if (audienceOption === 'existing') {
        // Use element_ids from selected people
        identifier = selectedPeople.map((p) => p.element_id);
        identifier_type = 'ELEMENT_ID';
      } else {
        // Parse LinkedIn URLs from manual input (split by newlines, filter empty)
        identifier = manualUrls
          .split('\n')
          .map((url) => url.trim())
          .filter((url) => url !== '');
        identifier_type = 'LINKEDIN_URL';
      }

      // Construct the JSON payload according to the API specification
      const campaignPayload = {
        campaign_id: formData.campaign_id,
        identifier: identifier,
        identifier_type: identifier_type,
        sender_group_id: formData.sender_group_id,
        sender_id: formData.sender_id,
        template_id: formData.template_id,
      };

      // Console log the formatted JSON
      console.log('🚀 Generate Campaign Payload:', JSON.stringify(campaignPayload, null, 2));

      // Trigger the outreach email generation MCP tool
      const toolId = `outreach_email_generation_mcp_${serverName}`;

      console.log('📧 Triggering outreach_email_generation MCP tool:', {
        toolId,
        payload: campaignPayload,
      });

      const response = await fetch(`/api/agents/tools/${encodeURIComponent(toolId)}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(campaignPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(
          `HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`,
        );
      }

      const data = await response.json();
      console.log('✅ Outreach email generation response:', data);

      // Parse and log the result if it exists
      if (data.result) {
        try {
          const parsedResult =
            typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

          console.log('📧 Parsed result:', parsedResult);
          console.log('📊 Result summary:', {
            type: typeof parsedResult,
            isArray: Array.isArray(parsedResult),
            length: Array.isArray(parsedResult) ? parsedResult.length : 'N/A',
            data: parsedResult,
          });
        } catch (parseError) {
          console.error('❌ Error parsing result:', parseError);
          console.log('📄 Raw result:', data.result);
        }
      } else {
        console.warn('⚠️ No result field in response');
      }

      // Update form data with audience info and tool response for the onSubmit callback
      const finalFormData: any = {
        ...formData,
        audience_type: audienceOption,
        selected_people:
          audienceOption === 'existing' ? selectedPeople.map((p) => p.element_id) : undefined,
        manual_urls: audienceOption === 'manual' ? manualUrls : undefined,
        toolResponse: data, // Include the tool response
      };

      // Call onSubmit after successful tool execution
      onSubmit?.(finalFormData);
    } catch (error) {
      console.error('❌ Error generating outreach emails:', error);
      // TODO: Show error message to user
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmit, audienceOption, selectedPeople, manualUrls, token, serverName]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const canProceedFromSender = formData.sender_id !== '';
  const canProceedFromAudience =
    audienceOption === 'existing'
      ? selectedPeople.length > 0
      : manualUrls.trim() !== '' && manualUrls.split('\n').some((url) => url.trim());
  const canSubmit =
    formData.sender_id && canProceedFromAudience && formData.campaign_id && formData.template_id;

  // If form is cancelled, show cancelled state
  if (isCancelled) {
    return (
      <div className="my-4 rounded-xl border border-red-400 bg-red-50 p-4 shadow-lg dark:bg-red-900/20">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
              ❌ Outreach Campaign Cancelled
            </h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300">
            The outreach campaign configuration form was cancelled.
          </p>
        </div>
      </div>
    );
  }

  // If form is submitted, show success state
  if (isSubmitted && submittedData) {
    return (
      <div className="my-4 rounded-xl border-2 border-green-500 bg-gray-800 p-6 shadow-lg">
        <div className="mb-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500">
              <Check className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-green-400">Campaign Generated!</h3>
              <p className="text-sm text-green-300">
                Your personalized outreach campaign is ready to review
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg bg-gray-900/50 p-4">
          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Sender</Label>
            <div className="text-white">{submittedData.senderLabel || submittedData.sender_id}</div>
          </div>

          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Target List</Label>
            <div className="text-white">{submittedData.listLabel || submittedData.list_id}</div>
          </div>

          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Campaign</Label>
            <div className="text-white">
              {submittedData.campaignLabel || submittedData.campaign_id}
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-sm font-medium text-gray-300">Email Template</Label>
            <div className="text-white">
              {submittedData.templateLabel || submittedData.template_id}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Processing state - shown while MCP tool is executing
  if (isSubmitting && !isSubmitted) {
    return (
      <div className="my-4 rounded-xl border border-gray-600 bg-gray-800 p-8 shadow-lg">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <h3 className="mb-2 text-lg font-semibold text-white">Generating Outreach Campaign...</h3>
          <div className="space-y-2 text-sm text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span>Enriching recipient profiles</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span>Generating personalized emails</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span>Processing campaign...</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">This may take a few moments</p>
        </div>
      </div>
    );
  }

  const steps = ['sender', 'audience', 'campaign'] as const;
  const stepIndex = steps.indexOf(currentStep);

  return (
    <div className="my-4 space-y-6 rounded-xl border border-gray-600 bg-gray-800 p-6 shadow-lg">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500"></div>
          <h3 className="text-lg font-semibold text-white">Outreach Campaign Configuration</h3>
        </div>
        <p className="text-sm text-gray-300">
          Configure your personalized outreach campaign. Chat is disabled until you submit or cancel
          this form.
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="mb-6 flex items-center justify-between">
        {steps.map((step, idx) => (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  currentStep === step
                    ? 'bg-orange-500 text-white'
                    : idx < stepIndex
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {idx < stepIndex ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span className="hidden text-sm font-medium capitalize text-gray-300 sm:inline">
                {step}
              </span>
            </div>
            {idx < 2 && <div className="mx-2 h-0.5 flex-1 bg-gray-700"></div>}
          </React.Fragment>
        ))}
      </div>

      {/* Sender Selection Step */}
      {currentStep === 'sender' && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-white">Select Sender Profile</h3>
            <p className="text-sm text-gray-400">Who will these emails be sent from?</p>
          </div>

          <div className="max-h-96 space-y-3 overflow-y-auto">
            {senderOptions.length === 0 ? (
              <div className="rounded-lg bg-gray-900/50 p-4 text-center text-gray-400">
                No sender profiles available
              </div>
            ) : (
              Object.entries(groupedSenders).map(([company, senders]) => (
                <div key={company} className="space-y-2">
                  <div className="px-1 text-sm font-medium text-gray-400">{company}</div>
                  {senders.map((sender) => (
                    <button
                      key={sender.id}
                      onClick={() => handleSenderSelect(sender)}
                      className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                        formData.sender_id === sender.id
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                          <User className="h-5 w-5 text-orange-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white">{sender.name}</div>
                          <div className="truncate text-sm text-gray-400">
                            {sender.occupation || 'No title'}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
              className="flex-1 border-gray-600 bg-transparent text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setCurrentStep('audience')}
              disabled={!canProceedFromSender}
              className="flex-1 bg-orange-500 text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
            >
              Continue
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Audience Selection Step */}
      {currentStep === 'audience' && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-white">Select Target Audience</h3>
            <p className="text-sm text-gray-400">Who should receive these emails?</p>
          </div>

          {/* Audience Type Toggle */}
          <div className="flex gap-2 rounded-lg bg-gray-800 p-1">
            <button
              onClick={() => setAudienceOption('existing')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                audienceOption === 'existing'
                  ? 'bg-gray-700 text-gray-100 shadow-lg'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Existing List
            </button>
            <button
              onClick={() => setAudienceOption('manual')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                audienceOption === 'manual'
                  ? 'bg-gray-700 text-gray-100 shadow-lg'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Manual URLs
            </button>
          </div>

          {audienceOption === 'existing' ? (
            <div className="space-y-4">
              {/* Step 1: Select List */}
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-300">
                  Step 1: Select List
                </Label>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {listOptions.length === 0 ? (
                    <div className="rounded-lg bg-gray-900/50 p-4 text-center text-gray-400">
                      No contact lists available
                    </div>
                  ) : (
                    listOptions.map((list) => (
                      <button
                        key={list.id}
                        onClick={() => handleFieldChange('list_id', list.id)}
                        className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                          formData.list_id === list.id
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20">
                              <Users className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-100">{list.list_name}</div>
                              <div className="text-sm text-gray-400">
                                {Math.floor(list.leads_count)} contacts
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Step 2: Select ICP */}
              {formData.list_id && (
                <div>
                  <Label className="mb-2 block text-sm font-medium text-gray-300">
                    Step 2: Select ICP
                  </Label>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {icpOptions.length === 0 ? (
                      <div className="rounded-lg bg-gray-900/50 p-4 text-center text-gray-400">
                        No ICPs available
                      </div>
                    ) : (
                      icpOptions.map((icp) => (
                        <button
                          key={icp.element_id}
                          onClick={() => {
                            setSelectedIcp(icp);
                            handleFieldChange('icp_id', icp.element_id);
                          }}
                          className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
                            formData.icp_id === icp.element_id
                              ? 'border-orange-500 bg-orange-500/10'
                              : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-100">{icp.title}</div>
                          {icp.manual_query && (
                            <div className="mt-1 text-xs text-gray-400">{icp.manual_query}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Find Matches Button */}
              {formData.list_id && formData.icp_id && (
                <Button
                  type="button"
                  onClick={handleSearchIcp}
                  disabled={searching}
                  className="w-full bg-purple-500 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {searching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Finding Matches...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Find Matches
                    </>
                  )}
                </Button>
              )}

              {/* Step 3: Select People */}
              {searchResults.length > 0 && (
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Label className="text-sm font-semibold text-gray-100">
                      Step 3: Select People (max 30)
                    </Label>
                    <span className="text-xs text-gray-400">{selectedPeople.length} selected</span>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {searchResults.map((person) => (
                      <button
                        key={person.element_id}
                        onClick={() => togglePersonSelection(person)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          selectedPeople.find((p) => p.element_id === person.element_id)
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-100">{person.name}</div>
                            <div className="text-xs text-gray-400">
                              {person.job_titles?.[0] || 'Unknown title'} at{' '}
                              {person.company || 'Unknown company'}
                            </div>
                          </div>
                          {person.score && (
                            <div className="text-xs font-semibold text-green-400">
                              {Math.round(parseFloat(person.score) * 100)}% match
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-300">
                  LinkedIn Profile URLs
                </Label>
                <p className="mb-3 text-xs text-gray-400">
                  Enter one LinkedIn profile URL per line
                </p>
                <textarea
                  value={manualUrls}
                  onChange={(e) => setManualUrls(e.target.value)}
                  placeholder="https://linkedin.com/in/john-doe&#10;https://linkedin.com/in/jane-smith&#10;https://linkedin.com/in/alex-johnson"
                  rows={6}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-transparent focus:ring-2 focus:ring-orange-500"
                />
                <div className="mt-2 text-xs text-gray-400">
                  {manualUrls.split('\n').filter((url) => url.trim()).length} URL(s) entered
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => setCurrentStep('sender')}
              variant="outline"
              className="border-gray-600 bg-transparent px-6 text-gray-300 hover:bg-gray-700"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => setCurrentStep('campaign')}
              disabled={!canProceedFromAudience}
              className="flex-1 bg-orange-500 text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
            >
              Continue
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Campaign & Template Selection Step */}
      {currentStep === 'campaign' && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-white">Campaign Settings</h3>
            <p className="text-sm text-gray-400">Select campaign and email template</p>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-300">Campaign</Label>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {campaignOptions.length === 0 ? (
                <div className="rounded-lg bg-gray-900/50 p-4 text-center text-gray-400">
                  No campaigns available
                </div>
              ) : (
                campaignOptions.map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => handleFieldChange('campaign_id', campaign.id)}
                    className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
                      formData.campaign_id === campaign.id
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 flex-shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{campaign.name}</div>
                        {campaign.description && (
                          <div className="truncate text-xs text-gray-400">
                            {campaign.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-sm font-medium text-gray-300">Email Template</Label>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {templateOptions.length === 0 ? (
                <div className="rounded-lg bg-gray-900/50 p-4 text-center text-gray-400">
                  No email templates available
                </div>
              ) : (
                templateOptions.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleFieldChange('template_id', template.id)}
                    className={`w-full rounded-lg border-2 p-3 text-left transition-all ${
                      formData.template_id === template.id
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 flex-shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{template.name}</div>
                        {template.subject_line && (
                          <div className="truncate text-xs text-gray-400">
                            Subject: {template.subject_line}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={() => setCurrentStep('audience')}
              variant="outline"
              className="border-gray-600 bg-transparent px-6 text-gray-300 hover:bg-gray-700"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="flex-1 bg-green-500 font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Campaign'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachForm;
