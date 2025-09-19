import { Constants } from 'librechat-data-provider';

export const mcpToolPattern = new RegExp(`^.+${Constants.mcp_delimiter}.+$`);
/**
 * Normalizes a server name to match the pattern ^[a-zA-Z0-9_.-]+$
 * This is required for Azure OpenAI models with Tool Calling
 */
export function normalizeServerName(serverName: string): string {
  // Check if the server name already matches the pattern
  if (/^[a-zA-Z0-9_.-]+$/.test(serverName)) {
    return serverName;
  }

  /** Replace non-matching characters with underscores.
    This preserves the general structure while ensuring compatibility.
    Trims leading/trailing underscores
    */
  const normalized = serverName.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^_+|_+$/g, '');

  // If the result is empty (e.g., all characters were non-ASCII and got trimmed),
  // generate a fallback name to ensure we always have a valid function name
  if (!normalized) {
    /** Hash of the original name to ensure uniqueness */
    let hash = 0;
    for (let i = 0; i < serverName.length; i++) {
      hash = (hash << 5) - hash + serverName.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return `server_${Math.abs(hash)}`;
  }

  return normalized;
}

/**
 * Sanitizes a URL by removing query parameters to prevent credential leakage in logs.
 * @param url - The URL to sanitize (string or URL object)
 * @returns The sanitized URL string without query parameters
 */
export function sanitizeUrlForLogging(url: string | URL): string {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

export const uiResourcesInstructions = `The tool response contains UI resources (i.e. Resource URI starting with "ui://"),
    include relevant UI elements in the next message using the following syntax.

    This is how these UI resources look like:

    Resource Text: https://mcpstorefront.com/img/storefront/product.component.html?store_domain=allbirds.com&product_handle=mens-tree-runner-go-blizzard-bold-red&product_id=gid://shopify/Product/7091625328720&mode=tool
    Resource URI: ui://product/gid://shopify/Product/7091625328720
    Resource MIME Type: text/uri-list

    If there is only one UI resource, use the following syntax:

    :::artifact{identifier="a-unique-identifier" type="mcp-ui-single" title="The most descriptive title for the UI resource"}
    ui://product/gid://shopify/Product/7091625328720
    :::

    Note: You only need to include the URI, not the full JSON. The system will automatically retrieve the full resource data.

    If there are multiple UI resources, like this:

    Resource Text: https://mcpstorefront.com/img/storefront/product.component.html?store_domain=allbirds.com&product_handle=mens-tree-runner-go-blizzard-bold-red&product_id=gid://shopify/Product/7091625328720&mode=tool
    Resource URI: ui://product/gid://shopify/Product/7091625328720
    Resource MIME Type: text/uri-list

    Resource Text: https://mcpstorefront.com/img/storefront/product.component.html?store_domain=allbirds.com&product_handle=mens-tree-runners-blizzard-bold-red&product_id=gid://shopify/Product/7091621527632&mode=tool
    Resource URI: ui://product/gid://shopify/Product/7091621527632
    Resource MIME Type: text/uri-list

    Resource Text: https://mcpstorefront.com/img/storefront/product.component.html?store_domain=allbirds.com&product_handle=womens-tree-runners-blizzard-bold-red&product_id=gid://shopify/Product/7091621888080&mode=tool
    Resource URI: ui://product/gid://shopify/Product/7091621888080
    Resource MIME Type: text/uri-list

    Use the following syntax:

    :::artifact{identifier="a-unique-identifier" type="mcp-ui-carousel" title="The most descriptive title for the UI resources"}
    ui://product/gid://shopify/Product/7091625328720, ui://product/gid://shopify/Product/7091621527632, ui://product/gid://shopify/Product/7091621888080
    :::

    Note: You only need to include comma-separated URIs, not the full JSON array. The system will automatically retrieve the full resource data.

    Make sure that all artifacts both start and end with :::`;
