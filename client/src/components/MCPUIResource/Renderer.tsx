import { UIResourceRenderer as LegacyUIResourceRenderer } from '@mcp-ui/client';
import type { UIResource } from 'librechat-data-provider';
import type { ComponentProps } from 'react';

type LegacyRendererProps = ComponentProps<typeof LegacyUIResourceRenderer>;

type UIResourceRendererProps = Omit<
  LegacyRendererProps,
  'resource' | 'remoteDomProps' | 'supportedContentTypes'
> & {
  resource: UIResource;
};

/** Restricts legacy MCP-UI rendering to sandboxed inline HTML resources. */
export default function UIResourceRenderer({
  resource,
  htmlProps,
  ...props
}: UIResourceRendererProps) {
  if (resource.mimeType !== 'text/html') {
    return null;
  }

  const safeResource = { ...resource };
  const safeHtmlProps = { ...htmlProps };
  delete safeResource.contentType;
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
