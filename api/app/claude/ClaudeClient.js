const Keyv = require('keyv');
const { fetchEventSource } = require('@fortaine/fetch-event-source');

const HUMAN_PROMPT = "\n\nHuman:";
const AI_PROMPT = "\n\nAssistant:";

const ANTHROPIC_SDK = "anthropic-typescript/0.4.4";
const ANTHROPIC_VERSION = "2023-01-01";
const DEFAULT_API_URL = "https://api.anthropic.com";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-1";

const DONE_MESSAGE = "[DONE]";

// const tokenizersCache = {};

class ClaudeClient {

  constructor(apiKey, options = {}, cacheOptions = {}) {
    this.apiUrl = options?.apiUrl ?? DEFAULT_API_URL;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    
    cacheOptions.namespace = cacheOptions.namespace || 'anthropic';
    this.conversationsCache = new Keyv(cacheOptions);
  }

  completeStream(params, {onOpen, onUpdate, signal}) {
    const abortController = new AbortController();

    return new Promise((resolve, reject) => {
      signal?.addEventListener("abort", (event) => {
        abortController.abort(event);
        reject({
          name: "AbortError",
          message: "Caller aborted completeStream",
        });
      });

      fetchEventSource(`${this.apiUrl}/v1/complete`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Anthropic-SDK": ANTHROPIC_SDK,
          "Anthropic-Version": ANTHROPIC_VERSION,
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify({ ...params, stream: true }),
        signal: abortController.signal,
        onopen: async (response) => {
          if (!response.ok) {
            abortController.abort();
            return reject(
              Error(
                `Failed to open sampling stream, HTTP status code ${response.status}: ${response.statusText}`
              )
            );
          }

          if (onOpen) {
            await Promise.resolve(onOpen(response));
          }
        },
        onmessage: (ev) => {
          if (ev.event === "ping") {
            return;
          }

          if (ev.data === DONE_MESSAGE) {
            console.error(
              "Unexpected done message before stop_reason has been issued"
            );
            return;
          }

          const completion = JSON.parse(ev.data);

          if (onUpdate) {
            Promise.resolve(onUpdate(completion)).catch((error) => {
              abortController.abort();
              reject(error);
            });
          }

          if (completion.stop_reason !== null) {
            abortController.abort();
            return resolve(completion);
          }
        },
        onerror: (error) => {
          console.error("Sampling error:", error);
          abortController.abort();
          return reject(error);
        },
      });
    });
  }
}

module.exports = {ClaudeClient, HUMAN_PROMPT, AI_PROMPT, CLAUDE_MODEL};
