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
 * Strict CSP injected into every live artifact. Live artifacts receive private
 * MCP tool results, so the contract is hard: the consented bridge is the ONLY
 * egress. No directive may permit an outbound request to any host.
 *
 * - `default-src 'none'` denies everything not explicitly allowed.
 * - `script-src 'unsafe-inline'` / `style-src 'unsafe-inline'` allow only
 *   *inline* code — NO remote origins (a `<script src=cdn/…data>` is an egress
 *   channel even to an allowlisted host, so all JS/CSS must be inlined).
 * - `img-src data:` / `font-src data:` block pixel/`@font-face` URL exfil.
 * - `connect-src 'none'` blocks fetch/XHR/WebSocket/EventSource/sendBeacon.
 * - `form-action 'none'` blocks form-POST exfil; `navigate-to 'none'` blocks
 *   self-navigation exfil where the engine supports it.
 *
 * Note: a `<meta>` CSP cannot carry `frame-ancestors`/`sandbox`/`report-uri`
 * (enforced by the iframe element's attributes), and `navigate-to` has partial
 * engine support — so self-navigation is also defended in the host by refusing
 * to hand the bridge port to a navigated document.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
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
  };
})();
`;

const buildHead = (): string =>
  `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">` +
  `<meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<script>${BRIDGE_SHIM}</script>`;

/**
 * Wrap model-authored HTML so the CSP + bridge shim are the very first things
 * the parser sees. We ALWAYS nest the authored markup inside our own
 * `<body>` rather than injecting into the model's `<head>` — injecting after an
 * existing `<head>` would let any markup the model placed *before* that tag
 * (e.g. `<script>…</script><html><head>`) execute before the policy is active.
 * Nesting a full document inside the body is tolerated by parsers (the inner
 * doctype/html/head tags are ignored; scripts/styles still run) and guarantees
 * the CSP governs everything.
 */
export const buildLiveArtifactDocument = (html: string): string =>
  `<!doctype html><html><head>${buildHead()}</head><body>${html}</body></html>`;
