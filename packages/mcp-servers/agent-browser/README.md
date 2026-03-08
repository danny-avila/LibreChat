# @librechat/mcp-agent-browser

Vercel [agent-browser](https://github.com/vercel-labs/agent-browser) wrapped as an MCP SSE server for LibreChat.

Uses Playwright with AI-optimised accessibility tree `@ref` snapshots — significantly better than raw CSS selectors for LLM-driven browser automation.

## Tools

| Tool | Description |
| --- | --- |
| `navigate` | Navigate to a URL (SSRF-protected) |
| `snapshot` | Get accessibility snapshot with `@ref` identifiers |
| `click` | Click element by `@ref` or CSS selector |
| `fill` | Fill form input by `@ref` or CSS selector |
| `get_text` | Get text content of an element |
| `press_key` | Press a keyboard key |
| `screenshot` | Take page screenshot |
| `get_url` | Get current URL |
| `close_browser` | Close browser session |
| `perplexica_search` | *(Optional)* Web search via Perplexica |

## Quick Start

```bash
docker build -t agent-browser-mcp .
docker run -p 8932:8932 agent-browser-mcp
```

## LibreChat Configuration

```yaml
mcpServers:
  agent-browser:
    type: sse
    url: http://agent-browser-mcp:8932/sse
```

## Security

- **SSRF protection**: The `navigate` tool rejects private IPs (10.x, 192.168.x, 172.16-31.x, 127.x) and internal hostnames.
- Runs as non-root `appuser` in Docker.
- No `express.json()` middleware — see source comments for explanation.
