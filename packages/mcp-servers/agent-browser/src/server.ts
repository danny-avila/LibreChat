import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { BrowserManager } from "agent-browser/dist/browser.js";
import { executeCommand } from "agent-browser/dist/actions.js";

const PORT = parseInt(process.env.PORT ?? "8932");
const CHROMIUM_PATH = process.env.CHROMIUM_PATH ?? "";

// Optional Perplexica integration — only enabled if PERPLEXICA_URL is set
const PERPLEXICA_URL = process.env.PERPLEXICA_URL ?? "";
const PERPLEXICA_CHAT_PROVIDER = process.env.PERPLEXICA_CHAT_PROVIDER ?? "";
const PERPLEXICA_CHAT_MODEL = process.env.PERPLEXICA_CHAT_MODEL ?? "";
const PERPLEXICA_EMBED_PROVIDER = process.env.PERPLEXICA_EMBED_PROVIDER ?? "";
const PERPLEXICA_EMBED_MODEL = process.env.PERPLEXICA_EMBED_MODEL ?? "";

let browser: BrowserManager | null = null;
let cmdId = 0;
const nextId = () => `c${++cmdId}`;

async function getBrowser(): Promise<BrowserManager> {
  if (!browser?.isLaunched()) {
    browser = new BrowserManager();
    const launchCmd: Record<string, unknown> = { id: nextId(), action: "launch", headless: true };
    if (CHROMIUM_PATH) launchCmd.executablePath = CHROMIUM_PATH;
    const resp = await executeCommand(launchCmd as any, browser);
    if (!resp.success) throw new Error(`Browser launch failed: ${(resp as any).error}`);
  }
  return browser;
}

async function cmd<T = unknown>(command: Record<string, unknown>): Promise<T> {
  const b = await getBrowser();
  const resp = await executeCommand({ id: nextId(), ...command } as any, b);
  if (!resp.success) throw new Error((resp as any).error ?? "Command failed");
  return (resp as any).data as T;
}

// --- SSRF Protection ---
const isPrivateHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "ip6-localhost" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  );
};

const isPrivateIp = (hostname: string): boolean => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const parts = hostname.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return hostname === "::1";
};

const isAllowedUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return !isPrivateHostname(parsed.hostname) && !isPrivateIp(parsed.hostname);
  } catch {
    return false;
  }
};

// --- Optional Perplexica search ---
async function perplexicaChat(query: string): Promise<string> {
  if (!PERPLEXICA_URL) throw new Error("Perplexica not configured");
  const messageId = `msg-${Date.now()}`;
  const chatId = `chat-${Date.now()}`;
  const body = {
    message: { messageId, chatId, role: "user", content: query },
    chatModel: { providerId: PERPLEXICA_CHAT_PROVIDER, key: PERPLEXICA_CHAT_MODEL },
    embeddingModel: { providerId: PERPLEXICA_EMBED_PROVIDER, key: PERPLEXICA_EMBED_MODEL },
    sources: ["web"],
    optimizationMode: "speed",
    history: [],
  };

  const resp = await fetch(`${PERPLEXICA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Perplexica ${resp.status}: ${await resp.text()}`);

  const rawText = await resp.text();
  const blockValues: Map<string, string> = new Map();
  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: any;
    try { event = JSON.parse(trimmed); } catch { continue; }
    if (event.type === "error") throw new Error(event.data ?? "Perplexica error");
    if (event.type === "updateBlock" && Array.isArray(event.patch)) {
      for (const patch of event.patch) {
        if (patch.op === "replace" && patch.path === "/data") {
          blockValues.set(event.blockId, String(patch.value ?? ""));
        }
      }
    }
  }
  return Array.from(blockValues.values()).join("\n\n").trim() || "No response from Perplexica";
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "agent-browser", version: "1.0.0" });

  // Register Perplexica search only if configured
  if (PERPLEXICA_URL) {
    server.tool(
      "perplexica_search",
      "Search the web using Perplexica AI (gives cited answers).",
      { query: z.string().describe("Search query") },
      async ({ query }: { query: string }) => {
        try {
          const result = await perplexicaChat(query);
          return { content: [{ type: "text", text: result }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Perplexica error: ${String(e)}` }] };
        }
      }
    );
  }

  server.tool(
    "navigate",
    "Navigate the browser to a URL. Returns the page title. SSRF-protected: rejects private/internal addresses.",
    {
      url: z.string().url().refine(isAllowedUrl, {
        message: "URL must use http/https and must not point to private or loopback addresses.",
      }).describe("Full public URL including https://"),
    },
    async ({ url }: { url: string }) => {
      const data = await cmd<{ url: string; title: string }>({ action: "navigate", url });
      return { content: [{ type: "text", text: `Navigated to: ${data.title} (${data.url})` }] };
    }
  );

  server.tool(
    "snapshot",
    "Get an accessibility snapshot of the current page with @ref identifiers. Use refs with click/fill tools.",
    {},
    async () => {
      const data = await cmd<{ snapshot: string; origin?: string }>({
        action: "snapshot",
        interactive: true,
      });
      return { content: [{ type: "text", text: data.snapshot }] };
    }
  );

  server.tool(
    "click",
    "Click an element by @ref (from snapshot) or CSS selector.",
    { ref: z.string().describe("@ref from snapshot (e.g. '@e1') or CSS selector") },
    async ({ ref }: { ref: string }) => {
      await cmd({ action: "click", selector: ref });
      return { content: [{ type: "text", text: `Clicked ${ref}` }] };
    }
  );

  server.tool(
    "fill",
    "Clear a form input and type a new value. Use @ref from snapshot or CSS selector.",
    {
      ref: z.string().describe("@ref from snapshot or CSS selector"),
      value: z.string().describe("Value to enter"),
    },
    async ({ ref, value }: { ref: string; value: string }) => {
      await cmd({ action: "fill", selector: ref, value });
      return { content: [{ type: "text", text: `Filled ${ref} with "${value}"` }] };
    }
  );

  server.tool(
    "get_text",
    "Get the text content of an element by CSS selector.",
    { selector: z.string().describe("CSS selector") },
    async ({ selector }: { selector: string }) => {
      const data = await cmd<{ text: string; origin?: string }>({ action: "gettext", selector });
      return { content: [{ type: "text", text: data.text.slice(0, 2000) }] };
    }
  );

  server.tool(
    "press_key",
    "Press a keyboard key globally (e.g. Enter, Tab, Escape, ArrowDown).",
    { key: z.string().describe("Key name e.g. Enter, Tab, ArrowDown") },
    async ({ key }: { key: string }) => {
      const b = await getBrowser();
      await b.getPage().keyboard.press(key);
      return { content: [{ type: "text", text: `Pressed ${key}` }] };
    }
  );

  server.tool(
    "screenshot",
    "Take a screenshot of the current page.",
    {},
    async () => {
      const b = await getBrowser();
      const page = b.getPage();
      await page.screenshot({ path: "/tmp/screenshot.png" });
      return { content: [{ type: "text", text: "Screenshot taken (saved to /tmp/screenshot.png)" }] };
    }
  );

  server.tool(
    "get_url",
    "Get the current browser URL.",
    {},
    async () => {
      const data = await cmd<{ url: string }>({ action: "url" });
      return { content: [{ type: "text", text: data.url }] };
    }
  );

  server.tool(
    "close_browser",
    "Close the browser session and free resources.",
    {},
    async () => {
      if (browser) {
        const b = browser.getBrowser();
        if (b) await b.close().catch(() => {});
        browser = null;
      }
      return { content: [{ type: "text", text: "Browser closed" }] };
    }
  );

  return server;
}

// CRITICAL: Do NOT add express.json() or any body-parsing middleware here.
// SSEServerTransport.handlePostMessage() reads the raw request body as a Node.js readable
// stream. If express.json() pre-consumes the stream, every MCP initialize handshake fails
// with HTTP 400 "stream is not readable", silently preventing all tool execution.
const app = express();
const transports: Map<string, SSEServerTransport> = new Map();

app.get("/health", (_req: Request, res: Response) => {
  const tools = [
    "navigate", "snapshot", "click", "fill", "get_text",
    "press_key", "screenshot", "get_url", "close_browser",
  ];
  if (PERPLEXICA_URL) tools.unshift("perplexica_search");
  res.json({ status: "ok", tools });
});

app.get("/sse", async (req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  const id = transport.sessionId;
  transports.set(id, transport);
  const server = buildMcpServer();
  await server.connect(transport);
  res.on("close", () => transports.delete(id));
});

app.post("/messages", async (req: Request, res: Response) => {
  const id = req.query.sessionId as string;
  const transport = transports.get(id);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`agent-browser MCP server listening on port ${PORT}`);
  if (PERPLEXICA_URL) console.log(`Perplexica integration enabled: ${PERPLEXICA_URL}`);
  else console.log("Perplexica integration disabled (set PERPLEXICA_URL to enable)");
});
