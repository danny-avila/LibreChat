import React, { useEffect, useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import { useMessageContext } from '~/Providers';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { isChatBlockedState, submittedFormsState } from '~/store/crawlForm';
import { useSubmitMessage, useLocalize } from '~/hooks';
import CrawlForm from './CrawlForm';
import CustomForm from './CustomForm';
import OutreachForm from './OutreachForm';
import SiteKeywordForm from './SiteKeywordForm';
import KeywordClusterForm from './KeywordClusterForm';
import XofuLoginForm from './XofuLoginForm';
import AddCrawlConfigForm from './AddCrawlConfigForm';

interface MCPToolDetectorProps {
  toolCall: any; // Tool call data
  output?: string | null;
}

// Configuration for MCP tools that should trigger specific behaviors
const MCP_TOOL_CONFIGS = {
  render_crawl_form: {
    triggerForm: true,
    formType: 'crawl',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing crawl form output:', output);

        let parsedData;
        try {
          // Handle TextContent array format: [{"type": "text", "text": "{...}"}]
          const outputArray = JSON.parse(output);
          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          parsedData = JSON.parse(output);
        }

        const websites = (parsedData.websites || []).map((ws: any) => ({
          id: ws.id,
          name: ws.name || ws.url,
          url: ws.url,
        }));

        const crawlConfigs = (parsedData.crawl_configs || []).map((config: any) => ({
          id: config.id,
          name: config.name,
          description: config.description,
          created_at: config.created_at,
        }));

        // Convert prefilled_params array to object
        const prefilledParams: any = {};
        if (Array.isArray(parsedData.prefilled_params)) {
          parsedData.prefilled_params.forEach((param: any) => {
            prefilledParams[param.key] = param.value;
          });
        }

        console.log('✅ Extracted crawl form options:', {
          websites: websites.length,
          crawlConfigs: crawlConfigs.length,
          prefilledParams,
        });

        return {
          websites,
          crawlConfigs,
          prefilledParams,
        };
      } catch (e) {
        console.error('❌ Failed to parse crawl form options:', e);
        return {
          websites: [],
          crawlConfigs: [],
          prefilledParams: {},
        };
      }
    },
  },
  render_add_crawl_config_form: {
    triggerForm: true,
    formType: 'add_crawl_config',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing add crawl config form output:', output);

        let parsedData;
        try {
          const outputArray = JSON.parse(output);
          if (Array.isArray(outputArray) && outputArray[0]?.text) {
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          parsedData = {};
        }

        // Convert prefilled_params array to object
        const prefilledParams: any = {};
        if (Array.isArray(parsedData.prefilled_params)) {
          parsedData.prefilled_params.forEach((param: any) => {
            prefilledParams[param.key] = param.value;
          });
        }

        console.log('✅ Extracted add crawl config form options:', {
          prefilledParams,
        });

        return { prefilledParams };
      } catch (e) {
        console.error('❌ Failed to parse add crawl config form options:', e);
        return { prefilledParams: {} };
      }
    },
  },
  render_custom_form: {
    triggerForm: true,
    formType: 'custom',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing custom form output:', output);
        console.log('🔍 Output type:', typeof output);

        // The output might be wrapped in an array with a text field, or plain text with NOTE
        let parsedData;
        let jsonString = output;

        try {
          // First try to parse as JSON array (TextContent format)
          const outputArray = JSON.parse(output);
          console.log('🔍 Parsed as array:', Array.isArray(outputArray));

          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            // Extract the text field and parse again
            console.log('🔍 Extracting from text field');
            jsonString = outputArray[0].text;
          } else {
            // It's already parsed JSON
            parsedData = outputArray;
          }
        } catch {
          // Not a JSON array, treat as plain text
          console.log('🔍 Not a JSON array, parsing as plain text');
        }

        // If we haven't parsed yet, extract JSON from plain text
        if (!parsedData) {
          // Remove NOTE section if present
          const noteIndex = jsonString.indexOf('\n\nNOTE:');
          if (noteIndex > 0) {
            jsonString = jsonString.substring(0, noteIndex);
            console.log('🔍 Removed NOTE section, JSON string:', jsonString);
          }

          // Now try to parse the cleaned JSON string
          parsedData = JSON.parse(jsonString.trim());
        }

        console.log('🔍 Final parsed data:', parsedData);

        // Extract form fields
        const formFields = (parsedData.form_fields || []).map((field: any) => {
          const fieldData: any = {
            label: field.label,
            type: field.type,
            id: field.label.toLowerCase().replace(/\s+/g, '_'),
          };

          // Add selector-specific properties
          if (field.type === 'selector') {
            fieldData.options = field.options || [];
            if (field.default) {
              fieldData.default = field.default;
            }
          }

          return fieldData;
        });

        console.log('✅ Extracted custom form fields:', formFields);

        // Convert prefilled_params array to object
        const prefilledParams: any = {};
        if (Array.isArray(parsedData.prefilled_params)) {
          parsedData.prefilled_params.forEach((param: any) => {
            prefilledParams[param.key] = param.value;
          });
        }

        return {
          formFields,
          requestId: parsedData.request_id,
          functionToolName: parsedData.function_tool_name,
          submitInstructions: parsedData.submit_instructions || undefined,
          prefilledParams,
        };
      } catch (e) {
        console.error('❌ Failed to parse custom form options:', e);
        console.error('❌ Output was:', output);
        return {
          formFields: [],
          requestId: null,
          functionToolName: null,
          prefilledParams: {},
        };
      }
    },
  },
  render_outreach_generate_form: {
    triggerForm: true,
    formType: 'outreach',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing outreach form output:', output);
        console.log('🔍 Output type:', typeof output);

        // The output might be wrapped in an array with a text field
        let parsedData;

        try {
          // First try to parse as JSON array
          const outputArray = JSON.parse(output);
          console.log('🔍 Parsed as array:', Array.isArray(outputArray));

          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            // Extract the text field and parse again
            console.log('🔍 Extracting from text field');
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          // If that fails, try parsing directly
          console.log('🔍 Parsing directly');
          parsedData = JSON.parse(output);
        }

        console.log('🔍 Final parsed data:', parsedData);

        // Extract senders with company information and sender_group_id
        const senders = (parsedData.sender_group_list || []).flatMap((group: any) =>
          (group.senders || []).map((sender: any) => ({
            id: sender.id,
            name: sender.name,
            occupation: sender.occupation,
            company_name: group.company_details?.name || 'Unknown Company',
            sender_group_id: group.sender_group_id || '',
          })),
        );

        // Extract lists
        const lists = (parsedData.upload_list_list || []).map((list: any) => ({
          id: list.id,
          list_name: list.list_name,
          leads_count: list.leads_count || 0,
        }));

        // Extract campaigns
        const campaigns = (parsedData.campaign_list || []).map((campaign: any) => ({
          id: campaign.id,
          name: campaign.name,
          campaign_goal: campaign.campaign_goal,
          description: campaign.description,
        }));

        // Extract templates
        const templates = (parsedData.email_template_list || []).map((template: any) => ({
          id: template.id,
          name: template.name,
          subject_line: template.subject_line,
          body: template.body,
        }));

        // Extract ICPs
        const icps = (parsedData.icp_list || []).map((icp: any) => ({
          element_id: icp.element_id,
          title: icp.title,
          manual_query: icp.manual_query,
          target_industry: icp.target_industry,
          target_level: icp.target_level,
          target_dept: icp.target_dept,
        }));

        console.log('✅ Extracted outreach options:', {
          senders: senders.length,
          lists: lists.length,
          campaigns: campaigns.length,
          templates: templates.length,
          icps: icps.length,
          sendersData: senders,
          listsData: lists,
          campaignsData: campaigns,
          templatesData: templates,
          icpsData: icps,
        });

        return {
          senders,
          lists,
          campaigns,
          templates,
          icps,
        };
      } catch (e) {
        console.error('❌ Failed to parse outreach form options:', e);
        console.error('❌ Output was:', output);
        return {
          senders: [],
          lists: [],
          campaigns: [],
          templates: [],
          icps: [],
        };
      }
    },
  },
  email_sme_questions_form: {
    triggerForm: true,
    formType: 'custom',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing email_sme_questions_form output:', output);
        console.log('🔍 Output type:', typeof output);

        // The output structure is: [{"type": "text", "text": "[{\"output\": \"```markdown...```\"}]"}]
        let emailContent = '';

        try {
          // First parse the outer array
          const outerArray = JSON.parse(output);
          console.log('🔍 Parsed outer array:', outerArray);

          if (Array.isArray(outerArray) && outerArray.length > 0 && outerArray[0].text) {
            // Parse the inner text field which contains another JSON array
            const innerArray = JSON.parse(outerArray[0].text);
            console.log('🔍 Parsed inner array:', innerArray);

            if (Array.isArray(innerArray) && innerArray.length > 0 && innerArray[0].output) {
              // Extract the markdown content from the output field
              emailContent = innerArray[0].output;

              // Remove markdown code fence if present
              emailContent = emailContent.replace(/^```markdown\n/, '').replace(/\n```$/, '');

              console.log('🔍 Extracted email content:', emailContent.substring(0, 200));
            }
          }
        } catch (parseError) {
          console.error('❌ Failed to parse nested structure:', parseError);
          // Fallback: try to extract markdown from the raw output
          const markdownMatch = output.match(/```markdown\n([\s\S]+?)\n```/);
          if (markdownMatch) {
            emailContent = markdownMatch[1];
            console.log('🔍 Extracted email content via regex fallback');
          }
        }

        // Create form fields for the email content and recipient
        const formFields = [
          {
            label: 'Recipient Email',
            type: 'email',
            id: 'recipient_email',
            default: '',
          },
          {
            label: 'Email Content',
            type: 'textarea',
            id: 'email_content',
            default: emailContent,
            rows: 15,
          },
        ];

        console.log('✅ Extracted email_sme_questions_form fields:', formFields);

        return {
          formFields,
          requestId: null,
          functionToolName: 'email_sme_questions_form',
          submitInstructions:
            'After you submit this form, the brevo_send_email tool will be used to send the email content to the recipient you specified.',
        };
      } catch (_e) {
        console.error('❌ Failed to parse email_sme_questions_form options:', _e);
        console.error('❌ Output was:', output);
        return {
          formFields: [],
          requestId: null,
          functionToolName: null,
        };
      }
    },
  },
  render_load_site_keyword_data_form: {
    triggerForm: true,
    formType: 'site_keyword',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing site keyword form output:', output);
        console.log('🔍 Output type:', typeof output);

        let parsedData;
        try {
          // First try to parse as JSON array (TextContent format)
          const outputArray = JSON.parse(output);
          console.log('🔍 Parsed as array:', Array.isArray(outputArray));

          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            // Extract the text field and parse again
            console.log('🔍 Extracting from text field');
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          // If that fails, try parsing directly
          console.log('🔍 Parsing directly');
          parsedData = JSON.parse(output);
        }

        console.log('🔍 Final parsed data:', parsedData);

        // Extract service accounts
        const serviceAccounts = (parsedData.service_accounts_list || []).map((sa: any) => ({
          id: sa.id,
          email: sa.email,
        }));

        // Extract websites
        const websites = (parsedData.websites_list || []).map((ws: any) => ({
          id: ws.id,
          name: ws.name,
          url: ws.url,
        }));

        // Extract keyword sources
        const keywordSources = parsedData.keywords_sources_list || ['gsc', 'dataforseo'];

        console.log('✅ Extracted site keyword options:', {
          serviceAccounts: serviceAccounts.length,
          websites: websites.length,
          keywordSources,
        });

        // Convert prefilled_params array to object
        const prefilledParams: any = {};
        if (Array.isArray(parsedData.prefilled_params)) {
          parsedData.prefilled_params.forEach((param: any) => {
            prefilledParams[param.key] = param.value;
          });
        }

        return {
          serviceAccounts,
          websites,
          keywordSources,
          prefilledParams,
        };
      } catch (e) {
        console.error('❌ Failed to parse site keyword form options:', e);
        console.error('❌ Output was:', output);
        return {
          serviceAccounts: [],
          websites: [],
          keywordSources: [],
          prefilledParams: {},
        };
      }
    },
  },
  convert_digest_json_to_html: {
    triggerForm: false,
    formType: undefined,
    extractOptions: undefined,
    renderHtmlPreview: true,
    extractHtml: (output: string): string | null => {
      try {
        let data: Record<string, unknown>;
        try {
          const parsed = JSON.parse(output);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.text) {
            data = JSON.parse(parsed[0].text as string);
          } else {
            data = typeof parsed === 'object' && parsed !== null ? parsed : {};
          }
        } catch {
          data = JSON.parse(output);
        }
        const TOOL_FIELD = 'convert_digest_json_to_html';
        const HTML_FIELD = 'html';
        // Top-level or data.*
        const topLevel = (data?.[TOOL_FIELD] ?? (data?.data as Record<string, unknown>)?.[TOOL_FIELD]) as Record<string, unknown> | undefined;
        let html = (data?.[HTML_FIELD] as string) ?? topLevel?.[HTML_FIELD] as string | undefined;
        if (typeof html === 'string' && html.length > 0) return html;
        if (!html && typeof data === 'object' && data !== null) {
          for (const value of Object.values(data)) {
            if (value && typeof value === 'object' && TOOL_FIELD in value) {
              const inner = (value as Record<string, unknown>)[TOOL_FIELD] as Record<string, unknown> | undefined;
              const h = inner?.[HTML_FIELD];
              if (typeof h === 'string' && h.length > 0) return h;
            }
          }
        }
        return null;
      } catch {
        return null;
      }
    },
  },
  render_load_keyword_cluster_form: {
    triggerForm: true,
    formType: 'keyword_cluster',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing keyword cluster form output:', output);

        let parsedData;
        try {
          const outputArray = JSON.parse(output);
          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          parsedData = JSON.parse(output);
        }

        const websites = (parsedData.websites_list || []).map((ws: any) => ({
          id: ws.id,
          name: ws.name,
          url: ws.url,
        }));

        console.log('✅ Extracted keyword cluster options:', {
          websites: websites.length,
        });

        // Convert prefilled_params array to object
        const prefilledParams: any = {};
        if (Array.isArray(parsedData.prefilled_params)) {
          parsedData.prefilled_params.forEach((param: any) => {
            prefilledParams[param.key] = param.value;
          });
        }

        return { websites, prefilledParams };
      } catch (e) {
        console.error('❌ Failed to parse keyword cluster form options:', e);
        console.error('❌ Output was:', output);
        return { websites: [], prefilledParams: {} };
      }
    },
  },
  render_xofu_login_form: {
    triggerForm: true,
    formType: 'xofu_login',
    extractOptions: (output: string) => {
      try {
        console.log('🔍 Parsing xofu login form output:', output);

        let parsedData;
        try {
          const outputArray = JSON.parse(output);
          if (Array.isArray(outputArray) && outputArray.length > 0 && outputArray[0].text) {
            parsedData = JSON.parse(outputArray[0].text);
          } else {
            parsedData = outputArray;
          }
        } catch {
          parsedData = JSON.parse(output);
        }

        console.log('✅ Extracted xofu login form config:', parsedData);
        return { formType: 'xofu_login' };
      } catch (e) {
        console.error('❌ Failed to parse xofu login form:', e);
        return { formType: 'xofu_login' };
      }
    },
  },
  // Add more MCP tool configurations here
};

export const MCPToolDetector: React.FC<MCPToolDetectorProps> = ({ toolCall, output }) => {
  const { messageId, conversationId } = useMessageContext();
  const [submittedForms, setSubmittedForms] = useRecoilState(submittedFormsState);
  const setChatBlocked = useSetRecoilState(isChatBlockedState);
  const { submitMessage } = useSubmitMessage();
  const localize = useLocalize();

  // Parse MCP tool name and server
  const { function_name, serverName, isMCPToolCall } = useMemo(() => {
    if (!toolCall?.name || typeof toolCall.name !== 'string') {
      return { function_name: '', serverName: '', isMCPToolCall: false };
    }

    if (toolCall.name.includes(Constants.mcp_delimiter)) {
      const [func, server] = toolCall.name.split(Constants.mcp_delimiter);
      return {
        function_name: func || '',
        serverName: server || '',
        isMCPToolCall: true,
      };
    }

    return { function_name: toolCall.name, serverName: '', isMCPToolCall: false };
  }, [toolCall?.name]);

  // Check if this is a configured MCP tool
  const toolConfig = useMemo(() => {
    if (!isMCPToolCall || !function_name) return null;
    return MCP_TOOL_CONFIGS[function_name as keyof typeof MCP_TOOL_CONFIGS] || null;
  }, [isMCPToolCall, function_name]);

  // Extract request ID from tool output
  const requestId = useMemo(() => {
    if (!output) return null;
    const requestMatch = output.match(/request_id::([a-f0-9-]+)/);
    return requestMatch ? requestMatch[1] : null;
  }, [output]);

  // Create unique form identifier using request ID if available
  const formId = useMemo(() => {
    if (requestId) {
      return `${conversationId || 'no-conv'}-${requestId}`;
    }
    // Fallback to message-based ID if no request ID
    return `${conversationId || 'no-conv'}-${messageId || 'no-msg'}-${function_name}`;
  }, [conversationId, messageId, function_name, requestId]);

  // Get form state
  const thisFormState = useMemo(() => {
    return submittedForms[formId] || { isSubmitted: false };
  }, [submittedForms, formId]);

  useEffect(() => {
    if (!toolConfig || !toolConfig.triggerForm || !output) {
      return;
    }

    console.log('🔍 MCP Tool Detector: Processing tool call', {
      function_name,
      serverName,
      requestId,
      formId,
      hasOutput: !!output,
      outputPreview: output.substring(0, 200),
    });

    // Extract options if available
    let options: any = [];
    if (toolConfig.extractOptions) {
      options = toolConfig.extractOptions(output);
      console.log('📋 MCP Tool Detector: Extracted options', {
        function_name,
        options,
      });
    }

    // Check if we have valid options (array with length or object with data)
    const hasValidOptions = Array.isArray(options)
      ? options.length > 0
      : options &&
        typeof options === 'object' &&
        Object.keys(options).length > 0 &&
        // For object-based options (like outreach and custom), check if at least one property has data
        Object.values(options).some((val: any) => (Array.isArray(val) ? val.length > 0 : !!val));

    // If we have options, trigger the form
    if (hasValidOptions) {
      console.log('✅ MCP Tool Detector: Options found, triggering form', {
        function_name,
        requestId,
        formId,
        options,
      });

      // Set chat as blocked for this specific conversation
      setChatBlocked((prev) => ({
        ...prev,
        [conversationId || 'no-conv']: true,
      }));

      // Store form data in state
      setSubmittedForms((prev) => ({
        ...prev,
        [formId]: {
          isSubmitted: false,
          isCancelled: false,
          toolName: function_name,
          serverName,
          requestId: requestId || undefined,
          options,
          output,
          formType: toolConfig.formType,
        },
      }));

      console.log('🎯 MCP Tool Detector: Form triggered', {
        formId,
        function_name,
        requestId,
        formType: toolConfig.formType,
      });
    } else {
      console.warn('⚠️ MCP Tool Detector: No valid options found, form not triggered', {
        function_name,
        hasOptions: !!options,
        options,
        isArray: Array.isArray(options),
        hasKeys: options && typeof options === 'object' ? Object.keys(options).length : 0,
      });
    }
  }, [toolConfig, output, function_name, serverName, formId, setChatBlocked, setSubmittedForms]);

  // Cleanup: unblock chat when component unmounts or conversation changes
  useEffect(() => {
    return () => {
      // Only unblock if this component was the one that blocked it
      if (toolConfig && thisFormState && !thisFormState.isSubmitted) {
        setChatBlocked((prev) => ({
          ...prev,
          [conversationId || 'no-conv']: false,
        }));
      }
    };
  }, [conversationId, toolConfig, thisFormState, setChatBlocked]);

  // Handle form submission
  const handleFormSubmit = React.useCallback(
    async (data: any) => {
      console.log('📤 MCP Tool Detector: Form submitted', {
        formId,
        function_name,
        requestId,
        data,
      });

      // Prepare submitted data with labels based on form type
      let submittedDataWithLabels = { ...data };

      if (toolConfig?.formType === 'outreach') {
        const options = (thisFormState as any).options || {};
        const sender = options.senders?.find((s: any) => s.id === data.sender_id);
        const list = options.lists?.find((l: any) => l.id === data.list_id);
        const campaign = options.campaigns?.find((c: any) => c.id === data.campaign_id);
        const template = options.templates?.find((t: any) => t.id === data.template_id);

        submittedDataWithLabels = {
          ...data,
          senderLabel: sender
            ? `${sender.name} (${sender.occupation || 'No title'}) at ${sender.company_name}`
            : undefined,
          listLabel: list
            ? `${list.list_name} (${Math.floor(list.leads_count)} contacts)`
            : undefined,
          campaignLabel: campaign?.name,
          templateLabel: template?.name,
        };
      } else if (toolConfig?.formType === 'crawl') {
        const options = (thisFormState as any).options || {};
        const website = options.websites?.find((w: any) => w.id === data.website_id);
        const websiteLabel = website ? `${website.name} (${website.url})` : data.website_id;

        const crawlConfig = options.crawlConfigs?.find((c: any) => c.id === data.crawl_config_id);
        const crawlConfigLabel = crawlConfig
          ? crawlConfig.name
          : data.crawl_config_id === 'default'
            ? 'Default Configuration'
            : data.crawl_config_id;

        submittedDataWithLabels = {
          ...data,
          websiteLabel,
          crawlConfigLabel,
        };
      } else if (toolConfig?.formType === 'add_crawl_config') {
        submittedDataWithLabels = {
          ...data,
          fileName: (data as any).file?.name,
        };
      }

      // Update form state
      setSubmittedForms((prev) => ({
        ...prev,
        [formId]: {
          ...prev[formId],
          isSubmitted: true,
          submittedData: submittedDataWithLabels,
        },
      }));

      let message: string;

      if (toolConfig?.formType === 'crawl') {
        // Handle crawl form submission with specific field mapping
        const options = (thisFormState as any).options || {};
        const website = options.websites?.find((w: any) => w.id === data.website_id);
        const websiteLabel = website ? `${website.name} (${website.url})` : data.website_id;

        const crawlConfig = options.crawlConfigs?.find((c: any) => c.id === data.crawl_config_id);
        const crawlConfigLabel = crawlConfig
          ? crawlConfig.name
          : data.crawl_config_id === 'default'
            ? 'Default Configuration'
            : data.crawl_config_id;

        const launchDate = data.launch_date
          ? new Date(data.launch_date).toLocaleDateString()
          : 'Not specified';

        let resultInfo = '';
        if (data.toolResponse?.result) {
          try {
            const resultString =
              typeof data.toolResponse.result === 'string'
                ? data.toolResponse.result
                : JSON.stringify(data.toolResponse.result);

            const isSuccess =
              resultString.includes('successfully') ||
              resultString.includes('created') ||
              resultString.includes('crawl');

            if (isSuccess) {
              resultInfo = `\n\n✅ **Status:** Crawl operation created successfully`;
              const idMatch = resultString.match(
                /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/,
              );
              if (idMatch) {
                resultInfo += `\n📋 **Operation ID:** ${idMatch[0]}`;
              }
            } else if (resultString.includes('error') || resultString.includes('Error')) {
              resultInfo = `\n\n❌ **Status:** Failed\n⚠️ **Error:** ${resultString}`;
            } else {
              resultInfo = `\n\n✅ **Status:** Request completed`;
            }
          } catch (parseError) {
            resultInfo = `\n\n✅ **Status:** Request completed`;
          }
        }

        message = `I have submitted the crawl configuration with the following details:\n\n🌐 **Website:** ${websiteLabel}\n⚙️ **Crawl Config:** ${crawlConfigLabel}\n📅 **Launch Date:** ${launchDate}\n📝 **Description:** ${data.description || 'Not specified'}${resultInfo}`;
      } else if (toolConfig?.formType === 'add_crawl_config') {
        const fileName = (data as any).file?.name || 'config file';

        let resultInfo = '';
        if (data.toolResponse?.result) {
          try {
            const configData =
              typeof data.toolResponse.result === 'string'
                ? JSON.parse(data.toolResponse.result)
                : data.toolResponse.result;

            if (configData.id) {
              resultInfo = `\n\n✅ **Status:** Configuration created successfully\n📋 **Config ID:** ${configData.id}`;
            }
          } catch (parseError) {
            resultInfo = `\n\n✅ **Status:** Configuration created`;
          }
        } else if (data.toolResponse?.error) {
          resultInfo = `\n\n❌ **Status:** Failed\n⚠️ **Error:** ${data.toolResponse.error}`;
        }

        message = `I have created the crawl configuration:\n\n📝 **Name:** ${data.name}\n📄 **File:** ${fileName}\n💬 **Description:** ${data.description || 'Not specified'}${resultInfo}`;
      } else if (toolConfig?.formType === 'outreach') {
        // Handle outreach form submission with tool response
        const options = (thisFormState as any).options || {};
        const sender = options.senders?.find((s: any) => s.id === data.sender_id);
        const campaign = options.campaigns?.find((c: any) => c.id === data.campaign_id);
        const template = options.templates?.find((t: any) => t.id === data.template_id);

        // Parse the tool response to extract operation IDs or error
        let operationInfo = '';
        if (data.toolResponse?.result) {
          try {
            const result =
              typeof data.toolResponse.result === 'string'
                ? JSON.parse(data.toolResponse.result)
                : data.toolResponse.result;

            // Check if it's a successful response with operation IDs
            if (result.if_pm?.create_sequential_operation?.success) {
              const opData = result.if_pm.create_sequential_operation.data;
              operationInfo = `\n\n✅ **Operation Status:** Successfully created\n📋 **Main Operation ID:** ${opData.mainOpId}\n🚀 **Outreach Operation ID:** ${opData.outreachOpId}`;
            } else if (result.if_pm?.create_sequential_operation?.success === false) {
              // Failed operation
              const errorMsg = result.if_pm.create_sequential_operation.error || 'Unknown error';
              operationInfo = `\n\n❌ **Operation Status:** Failed\n⚠️ **Error:** ${errorMsg}`;
            } else {
              // If result is just an error string
              operationInfo = `\n\n❌ **Operation Status:** Failed\n⚠️ **Error:** ${result}`;
            }
          } catch (parseError) {
            // If parsing fails, treat the result as an error message
            operationInfo = `\n\n❌ **Operation Status:** Failed\n⚠️ **Error:** ${data.toolResponse.result}`;
          }
        }

        const audienceInfo =
          data.audience_type === 'existing'
            ? `${data.selected_people?.length || 0} selected contacts`
            : `Manual LinkedIn URLs`;

        message = `I have submitted the outreach campaign configuration:\n\n👤 **Sender:** ${sender?.name || 'Unknown'} (${sender?.occupation || 'No title'}) at ${sender?.company_name || 'Unknown Company'}\n👥 **Audience:** ${audienceInfo}\n🎯 **Campaign:** ${campaign?.name || 'Unknown'}\n✉️ **Email Template:** ${template?.name || 'Unknown'}${operationInfo}`;
      } else if (toolConfig?.formType === 'site_keyword') {
        // Handle site keyword form submission with tool response
        const sourceLabel = data.keywords_source === 'gsc' ? 'Google Search Console' : 'DataForSEO';
        const website = (thisFormState as any).options?.websites?.find(
          (w: any) => w.id === data.website_id,
        );
        const websiteLabel = website ? `${website.name} (${website.url})` : data.website_id;

        let dateInfo = '';
        let serviceAccountInfo = '';
        if (data.keywords_source === 'gsc') {
          if (data.start_date && data.end_date) {
            dateInfo = `\n📅 **Date Range:** ${data.start_date} to ${data.end_date}`;
          }
          if (data.service_account) {
            const serviceAccount = (thisFormState as any).options?.serviceAccounts?.find(
              (sa: any) => sa.id === data.service_account,
            );
            const serviceAccountLabel = serviceAccount
              ? serviceAccount.email
              : data.service_account;
            serviceAccountInfo = `\n🔑 **Service Account:** ${serviceAccountLabel}`;
          }
        }

        let resultInfo = '';
        if (data.toolResponse?.result) {
          // Parse and display result summary
          try {
            const resultString =
              typeof data.toolResponse.result === 'string'
                ? data.toolResponse.result
                : JSON.stringify(data.toolResponse.result);

            // Check if the result indicates success
            const isSuccess =
              resultString.includes('successfully') ||
              resultString.includes('created') ||
              resultString.includes('if_lg');

            if (isSuccess) {
              resultInfo = `\n\n✅ **Status:** Operation created successfully`;

              // Try to extract operation ID
              const idMatch = resultString.match(/'id':\s*'([a-f0-9-]+)'/);
              if (idMatch) {
                resultInfo += `\n📋 **Operation ID:** ${idMatch[1]}`;
              }

              // Try to extract description
              const descMatch = resultString.match(/'descriptions':\s*'([^']+)'/);
              if (descMatch) {
                resultInfo += `\n📝 **Description:** ${descMatch[1]}`;
              }
            } else if (
              resultString.includes('error') ||
              resultString.includes('Error') ||
              resultString.includes('failed')
            ) {
              resultInfo = `\n\n❌ **Status:** Failed\n⚠️ **Error:** ${resultString}`;
            } else {
              resultInfo = `\n\n✅ **Status:** Request completed\n📄 **Response:** ${resultString.substring(0, 200)}`;
            }
          } catch (parseError) {
            resultInfo = `\n\n✅ **Status:** Request completed\n📄 **Response:** ${String(data.toolResponse.result).substring(0, 200)}`;
          }
        }

        message = `I have loaded site keyword data with the following configuration:\n\n🔍 **Source:** ${sourceLabel}\n🌐 **Website:** ${websiteLabel}${serviceAccountInfo}${dateInfo}${resultInfo}`;
      } else if (toolConfig?.formType === 'keyword_cluster') {
        // Handle keyword cluster form submission with tool response
        const website = (thisFormState as any).options?.websites?.find(
          (w: any) => w.id === data.website_id,
        );
        const websiteLabel = website ? `${website.name} (${website.url})` : data.website_id;

        let urlInfo = '';
        if (data.url_data && Array.isArray(data.url_data) && data.url_data.length > 0) {
          urlInfo = `\n📄 **URL Scope:** ${data.url_data.length} specific URL(s)`;
        } else {
          urlInfo = `\n📄 **URL Scope:** All keywords on website`;
        }

        let resultInfo = '';
        if (data.toolResponse?.result) {
          try {
            const resultString =
              typeof data.toolResponse.result === 'string'
                ? data.toolResponse.result
                : JSON.stringify(data.toolResponse.result);

            const isSuccess =
              resultString.includes('successfully') ||
              resultString.includes('created') ||
              resultString.includes('cluster');

            if (isSuccess) {
              resultInfo = `\n\n✅ **Status:** Clustering operation created successfully`;

              // Try to extract operation ID
              const idMatch = resultString.match(/'id':\s*'([a-f0-9-]+)'/);
              if (idMatch) {
                resultInfo += `\n📋 **Operation ID:** ${idMatch[1]}`;
              }

              // Try to extract cluster count if available
              const clusterMatch = resultString.match(/(\d+)\s+cluster/i);
              if (clusterMatch) {
                resultInfo += `\n📊 **Clusters:** ${clusterMatch[1]}`;
              }

              resultInfo += `\n⏳ **Note:** Clustering is processing in the background`;
            } else if (resultString.includes('error') || resultString.includes('Error')) {
              resultInfo = `\n\n❌ **Status:** Failed\n⚠️ **Error:** ${resultString}`;
            } else {
              resultInfo = `\n\n✅ **Status:** Request completed`;
            }
          } catch (parseError) {
            resultInfo = `\n\n✅ **Status:** Request completed`;
          }
        }

        message = `I have initiated keyword clustering with the following configuration:\n\n🌐 **Website:** ${websiteLabel}${urlInfo}${resultInfo}`;
      } else if (toolConfig?.formType === 'xofu_login') {
        // Handle xofu login form submission
        let statusInfo = '';
        if (data.error) {
          statusInfo = `\n\n❌ **Status:** Login failed\n⚠️ **Error:** ${data.error}`;
        } else if (data.token) {
          statusInfo = `\n\n✅ **Status:** Login successful\n🔐 **Authentication:** Token saved`;
        } else {
          statusInfo = `\n\n✅ **Status:** Login completed`;
        }

        message = `I have submitted the xofu login credentials:\n\n📧 **Email:** ${data.email}${statusInfo}`;
      } else {
        // Handle custom form submission with dynamic field generation
        const formFields = (thisFormState as any).options?.formFields || [];
        const fieldDetails = formFields
          .map((field: any) => {
            const value = data[field.id];
            let displayValue = value;

            // Handle boolean values
            if (field.type === 'bool') {
              displayValue = value ? 'Yes' : 'No';
            }
            // Handle selector values - show the label instead of value
            else if (field.type === 'selector' && field.options) {
              const selectedOption = field.options.find((opt: any) => opt.value === value);
              displayValue = selectedOption?.label || value;
            }
            // Handle date values if they exist
            else if (value && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
              try {
                displayValue = new Date(value).toLocaleString();
              } catch {
                displayValue = value;
              }
            }

            return `**${field.label}:** ${displayValue}`;
          })
          .join('\n');

        message = `I have submitted the ${toolConfig?.formType || 'form'} with the following configuration:\n\n${fieldDetails}\n\nPlease proceed based on these details.`;
      }

      await submitMessage({ text: message });

      setChatBlocked((prev) => ({
        ...prev,
        [conversationId || 'no-conv']: false,
      }));
    },
    [
      formId,
      function_name,
      toolConfig?.formType,
      setSubmittedForms,
      submitMessage,
      setChatBlocked,
      thisFormState,
    ],
  );

  // Handle form cancellation
  const handleFormCancel = React.useCallback(async () => {
    console.log('❌ MCP Tool Detector: Form cancelled', {
      formId,
      function_name,
      requestId,
    });

    // Update form state to show cancelled
    setSubmittedForms((prev) => ({
      ...prev,
      [formId]: {
        ...prev[formId],
        isSubmitted: false,
        isCancelled: true,
      },
    }));

    await submitMessage({
      text: "I decided not to submit the form at this time. Let's continue our conversation.",
    });
    setChatBlocked((prev) => ({
      ...prev,
      [conversationId || 'no-conv']: false,
    }));
  }, [formId, function_name, submitMessage, setChatBlocked, setSubmittedForms]);

  // If no tool config, don't render anything
  if (!toolConfig) {
    return null;
  }

  // HTML preview for convert_digest_json_to_html (weekly digest email)
  const htmlPreview =
    'renderHtmlPreview' in toolConfig &&
    toolConfig.renderHtmlPreview &&
    'extractHtml' in toolConfig &&
    typeof toolConfig.extractHtml === 'function'
      ? toolConfig.extractHtml(output ?? '')
      : null;
  if (htmlPreview) {
    return (
      <div className="my-3 w-full overflow-hidden rounded-xl border border-border-light bg-surface-secondary">
        <div className="border-b border-border-light bg-surface-primary px-3 py-2 text-sm font-medium text-text-primary">
          Weekly digest preview
        </div>
        <div className="relative max-h-[70vh] min-h-[200px] w-full overflow-auto bg-white">
          <iframe
            title="Weekly digest HTML preview"
            srcDoc={htmlPreview}
            sandbox="allow-same-origin"
            className="h-full min-h-[400px] w-full border-0"
            style={{ height: 'min(70vh, 800px)' }}
          />
        </div>
      </div>
    );
  }

  // Render the appropriate form based on form type
  if (toolConfig.formType === 'crawl') {
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <CrawlForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          websiteOptions={(thisFormState as any).options?.websites || []}
          crawlConfigOptions={(thisFormState as any).options?.crawlConfigs || []}
          prefilledParams={(thisFormState as any).options?.prefilledParams || {}}
          serverName={serverName}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
        />
      </>
    );
  }

  if (toolConfig.formType === 'add_crawl_config') {
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <AddCrawlConfigForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          prefilledParams={(thisFormState as any).options?.prefilledParams || {}}
          serverName={serverName}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
        />
      </>
    );
  }

  if (toolConfig.formType === 'custom') {
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <CustomForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          formFields={(thisFormState as any).options?.formFields || []}
          prefilledParams={(thisFormState as any).options?.prefilledParams || {}}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData}
          submitInstructions={(thisFormState as any).options?.submitInstructions}
        />
      </>
    );
  }

  if (toolConfig.formType === 'outreach') {
    const options = (thisFormState as any).options || {};
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <OutreachForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          senderOptions={options.senders || []}
          listOptions={options.lists || []}
          campaignOptions={options.campaigns || []}
          templateOptions={options.templates || []}
          icpOptions={options.icps || []}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
          serverName={serverName}
        />
      </>
    );
  }

  if (toolConfig.formType === 'site_keyword') {
    const options = (thisFormState as any).options || {};
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <SiteKeywordForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          serviceAccountOptions={options.serviceAccounts || []}
          websiteOptions={options.websites || []}
          keywordSources={options.keywordSources || ['gsc', 'dataforseo']}
          prefilledParams={options.prefilledParams || {}}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
          serverName={serverName}
        />
      </>
    );
  }

  if (toolConfig.formType === 'keyword_cluster') {
    const options = (thisFormState as any).options || {};
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <KeywordClusterForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          websiteOptions={options.websites || []}
          prefilledParams={options.prefilledParams || {}}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
          serverName={serverName}
        />
      </>
    );
  }

  if (toolConfig.formType === 'xofu_login') {
    return (
      <>
        {!thisFormState.isSubmitted && !thisFormState.isCancelled && (
          <div className="my-4 rounded-xl border border-orange-400 bg-orange-50 p-4 shadow-lg dark:bg-orange-900/20">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                {localize('com_ui_chat_disabled_complete_form')}
              </span>
            </div>
          </div>
        )}

        <XofuLoginForm
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          isSubmitted={thisFormState.isSubmitted}
          isCancelled={thisFormState.isCancelled}
          submittedData={thisFormState.submittedData as any}
        />
      </>
    );
  }

  return null;
};

export default MCPToolDetector;
