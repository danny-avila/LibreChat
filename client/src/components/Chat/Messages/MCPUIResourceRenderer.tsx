import React, { useCallback, useMemo } from 'react';
import { UIResourceRenderer } from '@mcp-ui/client';
import type { TMessage } from 'librechat-data-provider';
import { isUIResource } from '@mcp-ui/client';
import { cn } from '~/utils';

interface MCPUIResourceRendererProps {
  message: TMessage;
  className?: string;
}

const MCPUIResourceRenderer: React.FC<MCPUIResourceRendererProps> = ({
  message,
  className
}) => {
  const uiResources = useMemo(() => {
    if (!message.content) return [];

    return message.content
      .filter((content) => content.type === 'resource')
      .map((content) => content.resource)
      .filter((resource) => resource && isUIResource(resource));
  }, [message.content]);

  const handleUIAction = useCallback((result: any) => {
    // Handle UI actions from MCP UI resources
    console.log('MCP UI Action:', result);

    // TODO: Implement action handling based on result type
    // This could involve calling tools, opening links, prompting user, etc.
    if (result.type === 'tool') {
      // Handle tool call
      console.log('Tool call:', result.payload);
    } else if (result.type === 'link') {
      // Handle link opening
      window.open(result.payload.url, '_blank');
    } else if (result.type === 'prompt') {
      // Handle user prompt
      console.log('User prompt:', result.payload.prompt);
    } else if (result.type === 'intent') {
      // Handle intent
      console.log('Intent:', result.payload);
    } else if (result.type === 'notify') {
      // Handle notification
      console.log('Notification:', result.payload.message);
    }
  }, []);

  if (uiResources.length === 0) {
    return null;
  }

  return (
    <div className={cn('mcp-ui-resources space-y-4', className)}>
      {uiResources.map((resource, index) => (
        <div key={index} className="mcp-ui-resource">
          <UIResourceRenderer
            resource={resource}
            onUIAction={handleUIAction}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
};

export default MCPUIResourceRenderer;