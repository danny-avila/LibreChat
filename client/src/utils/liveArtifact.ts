import { Constants } from 'librechat-data-provider';

/** A live artifact is an HTML file whose record declares an MCP tool allowlist. */
export const isLiveArtifact = (type?: string, tools?: string[]): boolean =>
  type === 'text/html' && Array.isArray(tools) && tools.length > 0;

/** Split an MCP tool key (`<tool>_mcp_<server>`) for display in the consent prompt. */
export const splitMcpToolKey = (tool: string): { toolName: string; serverName: string } => {
  const delimiter = Constants.mcp_delimiter as string;
  const index = tool.indexOf(delimiter);
  if (index === -1) {
    return { toolName: tool, serverName: '' };
  }
  return { toolName: tool.slice(0, index), serverName: tool.slice(index + delimiter.length) };
};

/**
 * Strict CSP injected into every live artifact. `connect-src 'none'` is the
 * load-bearing line: the artifact cannot make its own network calls, so the
 * only data egress is the consented, allowlisted bridge. `script-src` permits
 * inline scripts (artifacts are inline) plus the two CDNs the prompt allows.
 *
 * Note: a `<meta>` CSP cannot carry `frame-ancestors`/`sandbox`/`report-uri` —
 * those are enforced by the iframe element's own attributes instead.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com",
  'img-src data: https:',
  'font-src data: https:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/**
 * Bridge shim, injected as the first script in the document. It waits for the
 * host to transfer a private `MessagePort`, then exposes
 * `window.librechat.callMcpTool(name, args)` which round-trips a request over
 * that port and resolves with the tool result. This is the only channel out.
 */
const BRIDGE_SHIM = `
(function () {
  var pending = {};
  var seq = 0;
  var resolvePort;
  var portReady = new Promise(function (r) { resolvePort = r; });

  function settle(data) {
    var entry = pending[data.id];
    if (!entry) return;
    delete pending[data.id];
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  }

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'librechat:init' || !event.ports[0]) return;
    var port = event.ports[0];
    port.onmessage = function (e) {
      if (e.data && e.data.type === 'tool-result') settle(e.data);
    };
    resolvePort(port);
  });

  function callMcpTool(name, args) {
    return portReady.then(function (port) {
      return new Promise(function (resolve, reject) {
        var id = 'c' + (++seq);
        pending[id] = { resolve: resolve, reject: reject };
        port.postMessage({ type: 'tool-call', id: id, name: name, args: args || {} });
        setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject(new Error('Tool call timed out')); }
        }, 60000);
      });
    });
  }

  window.librechat = {
    callMcpTool: callMcpTool,
    reload: function () { window.location.reload(); },
  };
})();
`;

const buildHead = (): string =>
  `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">` +
  `<meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<script>${BRIDGE_SHIM}</script>`;

/**
 * Wrap model-authored HTML into a document whose first head children are the
 * CSP and bridge shim, so both apply before any artifact code runs. Handles a
 * full document, an `<html>` without `<head>`, or a bare fragment.
 */
export const buildLiveArtifactDocument = (html: string): string => {
  const head = buildHead();
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => match + head);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  }
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;
};
