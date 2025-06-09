import { useState, useEffect } from 'react';
import { Checkbox } from '~/components/ui';
import { Spinner } from '~/components/svg';

// Mock tools that would come from MCP response
const mockMCPTools = [
  'get_weather',
  'get_stock_price',
  'get_news_headlines',
  'create_calendar_event',
  'send_email',
  'get_user_profile',
  'update_user_settings',
  'get_system_status',
  'get_api_usage',
  'get_error_logs',
];

interface MCPToolsProps {
  selectedTools: string[];
  onToolToggle: (toolName: string) => void;
}

export default function MCPTools({ selectedTools, onToolToggle }: MCPToolsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [tools, setTools] = useState<string[]>([]);

  useEffect(() => {
    // Simulate API delay
    const timer = setTimeout(() => {
      setTools(mockMCPTools);
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="mt-6">
        <div className="mb-2 text-sm font-medium">Available Tools</div>
        <div className="flex h-32 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-2 text-sm font-medium">Available Tools</div>
      <div className="space-y-1">
        {tools.map((tool) => (
          <div
            key={tool}
            className="flex items-center gap-2 rounded-lg border border-border-medium p-2 hover:bg-surface-secondary"
          >
            <Checkbox
              id={tool}
              checked={selectedTools.includes(tool)}
              onCheckedChange={() => onToolToggle(tool)}
              className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
            />
            <label htmlFor={tool} className="text-token-text-primary text-sm">
              {tool}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
