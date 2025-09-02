import { Settings, Palette, Key, KeySquare, MessageSquare, Image, Shield, Globe, Link, Wallet, Users as UsersIcon } from 'lucide-react';

export const AGENT_CAPABILITIES = [
  {
    id: 'file_search',
    label: 'File Search',
    description: 'Enable file searching and document analysis',
    icon: '📁'
  },
  {
    id: 'web_search',
    label: 'Web Search',
    description: 'Allow agents to search the internet',
    icon: '🌐'
  },
  {
    id: 'chain',
    label: 'Chain',
    description: 'Enable chaining of agent operations',
    icon: '🔗'
  }
] as const;

export interface Setting {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'text' | 'textarea' | 'url' | 'number' | 'capabilities';
  defaultValue: boolean | string | number | string[];
  placeholder?: string;
  parentKey?: string; // optional dependency key
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  settings: Setting[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'users',
    title: 'Users',
    description: 'Manage registered users',
    icon: UsersIcon,
    settings: [
      {
        key: 'allowRegistration',
        label: 'Allow User Registration',
        description: 'Enable or disable new-account sign-ups on the login page',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'balance.enabled',
        label: 'Enable Token Balance System',
        description: 'Turn on per-user token tracking and limits',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'balance.startBalance',
        label: 'Starting Balance',
        description: 'Tokens each new account begins with',
        type: 'number',
        defaultValue: 0,
        parentKey: 'balance.enabled',
      },
      {
        key: 'balance.autoRefillEnabled',
        label: 'Auto Refill',
        description: 'Automatically top-up user tokens on an interval',
        type: 'boolean',
        defaultValue: false,
        parentKey: 'balance.enabled',
      },
      {
        key: 'balance.refillAmount',
        label: 'Refill Amount',
        description: 'Tokens added at each refill interval',
        type: 'number',
        defaultValue: 0,
        parentKey: 'balance.autoRefillEnabled',
      },
      {
        key: 'balance.refillIntervalValue',
        label: 'Refill Interval – Value',
        description: 'Numeric part of interval',
        type: 'number',
        defaultValue: 1,
        parentKey: 'balance.autoRefillEnabled',
      },
      {
        key: 'balance.refillIntervalUnit',
        label: 'Refill Interval – Unit',
        description: 'seconds, minutes, hours, days, weeks, months',
        type: 'text',
        defaultValue: 'days',
        placeholder: 'hours',
        parentKey: 'balance.autoRefillEnabled',
      },
    ],
  },
  {
    id: 'interface',
    title: 'Interface & Experience',
    description: 'Control what features and UI elements users can access',
    icon: Settings,
    settings: [
      { 
        key: 'interface.modelSelect', 
        label: 'Model & Endpoint Selection', 
        description: 'Allow users to choose between different AI providers and models',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.parameters', 
        label: 'Model Parameters', 
        description: 'Allow users to adjust temperature, top-p, and other model parameters',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.sidePanel', 
        label: 'Tools Sidebar', 
        description: 'Show sidebar with agents, prompts, memories, and other tools',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.presets', 
        label: 'Conversation Presets', 
        description: 'Enable preset conversation templates for common use cases',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.prompts', 
        label: 'Prompt Library', 
        description: 'Access to shared prompt templates and community prompts',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.bookmarks', 
        label: 'Message Bookmarks', 
        description: 'Allow users to bookmark important messages for later reference',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.multiConvo', 
        label: 'Multiple Conversations', 
        description: 'Enable users to create and manage multiple conversation threads',
        type: 'boolean', 
        defaultValue: true 
      },
      { 
        key: 'interface.agents', 
        label: 'AI Agents', 
        description: 'Advanced AI agents with specialized capabilities and tools', 
        type: 'boolean', 
        defaultValue: true 
      },
      // ----- Agent endpoint nested settings -----
      {
        key: 'endpoints.agents.recursionLimit',
        label: 'Default Recursion Limit',
        description: 'Maximum steps per agent run (default)',
        type: 'number',
        defaultValue: 25,
        parentKey: 'interface.agents',
      },
      {
        key: 'endpoints.agents.maxRecursionLimit',
        label: 'Max Recursion Limit',
        description: 'Absolute upper limit of recursion steps users may set',
        type: 'number',
        defaultValue: 100,
        parentKey: 'interface.agents',
      },
      {
        key: 'endpoints.agents.allowedProviders',
        label: 'Allowed Providers',
        description: 'Comma-separated list of endpoint providers that agents may use',
        type: 'text',
        defaultValue: '',
        placeholder: 'openAI, google',
        parentKey: 'interface.agents',
      },
      {
        key: 'endpoints.agents.capabilities',
        label: 'Agent Capabilities',
        description: 'Select which capabilities agents can use',
        type: 'capabilities',
        defaultValue: [],
        parentKey: 'interface.agents',
      },
      {
        key: 'actions.allowedDomains',
        label: 'Allowed Domains',
        description: 'Comma-separated list of domains agents/assistants may call',
        type: 'textarea',
        defaultValue: '',
        placeholder: 'swapi.dev, librechat.ai',
        parentKey: 'interface.agents',
      },
      // ----- Memory toggle already exists; attach nested settings -----
      { 
        key: 'interface.memories', 
        label: 'Memories', 
        description: 'Enable AI memory functionality for personalized conversations', 
        type: 'boolean', 
        defaultValue: true 
      },
      {
        key: 'memory.personalize',
        label: 'Enable Personalization',
        description: 'Allow users to access personalization tab when memory is enabled',
        type: 'boolean',
        defaultValue: true,
        parentKey: 'interface.memories',
      },
      {
        key: 'memory.tokenLimit',
        label: 'Memory Token Limit',
        description: 'Maximum total tokens allowed for stored memories',
        type: 'number',
        defaultValue: 10000,
        parentKey: 'interface.memories',
      },
      {
        key: 'memory.validKeys',
        label: 'Valid Memory Keys',
        description: 'Comma-separated list restricting keys that can be stored',
        type: 'text',
        defaultValue: 'preferences, work_info, personal_info, skills, interests, context',
        placeholder: 'preferences, work_info',
        parentKey: 'interface.memories',
      },
      {
        key: 'memory.agent.id',
        label: 'Memory Agent ID',
        description: 'Existing agent ID to use for memory tasks (optional)',
        type: 'text',
        defaultValue: '',
        placeholder: 'agent-id-here',
        parentKey: 'interface.memories',
      },
    ],
  },
  {
    id: 'branding',
    title: 'Branding & Appearance',
    description: 'Customize logos, images, texts and site branding',
    icon: Palette,
    settings: [
      { 
        key: 'interface.customWelcome', 
        label: 'Welcome Message', 
        description: 'Custom welcome message shown to users on the main page',
        type: 'textarea', 
        defaultValue: '',
        placeholder: 'Enter a custom welcome message for your users...'
      },
      {
        key: 'appTitle',
        label: 'Application Title',
        description: 'Custom title displayed in browser tab and header',
        type: 'text',
        defaultValue: '',
        placeholder: 'Enter custom app title...'
      },
      {
        key: 'helpAndFaqURL',
        label: 'Help & FAQ URL',
        description: 'Link to your help documentation or FAQ page',
        type: 'url',
        defaultValue: '',
        placeholder: 'https://example.com/help'
      },
      {
        key: 'customFooter',
        label: 'Footer Content',
        description: 'Custom content displayed in the footer area',
        type: 'textarea',
        defaultValue: '',
        placeholder: 'Enter custom footer content...'
      },
      {
        key: 'logoUrl',
        label: 'Logo URL',
        description: 'URL for your custom logo image displayed in the header',
        type: 'url',
        defaultValue: '',
        placeholder: 'https://example.com/logo.png'
      },
      {
        key: 'faviconUrl',
        label: 'Favicon URL',
        description: 'URL for your custom favicon (bookmark icon) shown in browser tabs',
        type: 'url',
        defaultValue: '',
        placeholder: 'https://example.com/favicon.ico'
      },
      {
        key: 'backgroundImageUrl',
        label: 'Background Image URL',
        description: 'URL for custom background image displayed on the main page',
        type: 'url',
        defaultValue: '',
        placeholder: 'https://example.com/background.jpg'
      }
    ],
  },
  {
    id: 'models',
    title: 'Model Access Control',
    description: 'Control which AI models and features are available to users',
    icon: Key,
    settings: [
      {
        key: 'interface.webSearch',
        label: 'Web Search',
        description: 'Allow AI to search the internet for current information and facts',
        type: 'boolean',
        defaultValue: true
      },
      {
        key: 'interface.runCode',
        label: 'Code Execution',
        description: 'Enable AI to run and execute code in a secure environment',
        type: 'boolean',
        defaultValue: true
      }
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing & Links',
    description: 'Control shared-link functionality',
    icon: Link,
    settings: [
      {
        key: 'sharedLinksEnabled',
        label: 'Enable Share Links',
        description: 'Allow users to create shareable conversation links',
        type: 'boolean',
        defaultValue: true,
      },
      {
        key: 'publicSharedLinksEnabled',
        label: 'Public Share Links',
        description: 'Allow share links to be viewed without login',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  // Update Conversations group (add retention + toggle)
  {
    id: 'conversations',
    title: 'Conversation Settings',
    description: 'Control how conversations are created, stored, and managed',
    icon: MessageSquare,
    settings: [
      {
        key: 'interface.temporaryChat',
        label: 'Temporary Conversations',
        description: 'Enable conversations that are not saved to user history',
        type: 'boolean',
        defaultValue: false,
      },
      {
        key: 'interface.temporaryChatRetention',
        label: 'Temporary Chat Retention (hours)',
        description: 'How long temporary chats are kept before deletion (1-8760)',
        type: 'number',
        defaultValue: 720,
      },
    ],
  },
  {
    id: 'customEndpoints',
    title: 'Custom Endpoints',
    description: 'Define additional endpoints in YAML/JSON format',
    icon: Link,
    settings: [
      {
        key: 'endpoints.custom',
        label: 'Custom Endpoints YAML',
        description: 'Paste YAML representing the custom endpoints array',
        type: 'textarea',
        defaultValue: '',
        placeholder: '- name: "groq"\n  baseURL: "https://..."',
      },
    ],
  },
  {
    id: 'deprecatedBeta',
    title: 'Deprecated & Beta',
    description: 'Control access to deprecated or experimental functionality',
    icon: Shield,
    settings: [
      {
        key: 'interface.plugins',
        label: 'Plugins Endpoint',
        description: 'Enable or disable the ChatGPT Plugins endpoint for users',
        type: 'boolean',
        defaultValue: true,
      },
    ],
  },
]; 