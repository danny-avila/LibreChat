import { isMcpAppMimeType } from 'librechat-data-provider';
import { UIResourceRenderer as LegacyUIResourceRenderer } from '@mcp-ui/client';
import type { UIResource } from 'librechat-data-provider';
import type { ComponentProps } from 'react';
import { useMCPAppsPolicy } from '~/Providers/MCPAppsPolicyContext';

type LegacyRendererProps = ComponentProps<typeof LegacyUIResourceRenderer>;

type UIResourceRendererProps = Omit<
  LegacyRendererProps,
  'resource' | 'remoteDomProps' | 'supportedContentTypes'
> & {
  resource: UIResource;
};

export function isSupportedUIResource(
  resource: UIResource | null | undefined,
): resource is UIResource {
  return (
    typeof resource?.mimeType === 'string' &&
    !isMcpAppMimeType(resource.mimeType) &&
    resource.mimeType.split(';', 1)[0].trim().toLowerCase() === 'text/html'
  );
}

/** Restricts legacy MCP-UI rendering to sandboxed inline HTML resources. */
export default function UIResourceRenderer({
  resource,
  htmlProps,
  ...props
}: UIResourceRendererProps) {
  const { legacyHtmlEnabled } = useMCPAppsPolicy();

  if (!legacyHtmlEnabled || !isSupportedUIResource(resource)) {
    return null;
  }

  const safeResource = { ...resource };
  const safeHtmlProps = { ...htmlProps };
  delete safeResource.contentType;
  safeResource.mimeType = 'text/html';
  delete safeHtmlProps.sandboxPermissions;

  return (
    <LegacyUIResourceRenderer
      {...props}
      resource={safeResource}
      htmlProps={safeHtmlProps}
      supportedContentTypes={['rawHtml']}
    />
  );
}
