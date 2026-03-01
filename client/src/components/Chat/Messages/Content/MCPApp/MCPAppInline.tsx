import React, { useEffect, useRef, useState } from 'react';
import { fetchMCPResource } from './mcpAppUtils';
import MCPAppContainer from './MCPAppContainer';
import type { MCPAppArtifact } from 'librechat-data-provider';

interface ResourceMeta {
  ui?: {
    csp?: {
      resourceDomains?: string[];
      connectDomains?: string[];
      frameDomains?: string[];
      baseUriDomains?: string[];
    };
    permissions?: {
      camera?: boolean;
      microphone?: boolean;
      geolocation?: boolean;
      clipboardWrite?: boolean;
    };
    prefersBorder?: boolean;
    maxHeight?: number;
    allowFullscreen?: boolean;
  };
}

function MCPAppInlineImpl({ artifact }: { artifact: MCPAppArtifact }) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [resourceMeta, setResourceMeta] = useState<ResourceMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Capture toolResult/toolArguments on first render only — they don't change
  const toolResultRef = useRef(artifact.toolResult);
  const toolArgumentsRef = useRef(artifact.toolArguments);

  useEffect(() => {
    let cancelled = false;

    fetchMCPResource(artifact.serverName, artifact.resourceUri)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const content = response.contents?.[0];
        if (!content) {
          setError('No content returned from resource');
          return;
        }
        const html = content.text || (content.blob ? atob(content.blob) : null);
        if (!html) {
          setError('Resource returned no HTML content');
          return;
        }
        setHtmlContent(html);
        setResourceMeta((content._meta as ResourceMeta) || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.resourceUri, artifact.serverName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-text-secondary">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>Loading MCP App...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
        Failed to load MCP App: {error}
      </div>
    );
  }

  if (!htmlContent) {
    return null;
  }

  return (
    <MCPAppContainer
      html={htmlContent}
      resourceMeta={resourceMeta}
      serverName={artifact.serverName}
      toolResult={toolResultRef.current}
      toolArguments={toolArgumentsRef.current}
    />
  );
}

// Memoize to prevent re-renders from parent streaming updates
const MCPAppInline = React.memo(MCPAppInlineImpl, (prev, next) => {
  return (
    prev.artifact.resourceUri === next.artifact.resourceUri &&
    prev.artifact.serverName === next.artifact.serverName
  );
});

export default MCPAppInline;
