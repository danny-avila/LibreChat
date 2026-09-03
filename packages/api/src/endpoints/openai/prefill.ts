type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type KimiPrefill = {
  response: string;
  reasoning: string;
};

type KimiPrefillFetchOptions = {
  fetch: Fetch;
  prefill: KimiPrefill;
};

type CompletionChoice = {
  index?: number;
  delta?: Record<string, unknown>;
  message?: Record<string, unknown>;
  finish_reason?: string | null;
};

type CompletionPayload = {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  tools?: unknown[];
  response_format?: { type?: string };
  choices?: CompletionChoice[];
  [key: string]: unknown;
};

export function isKimiK3Model(model: unknown): model is string {
  return typeof model === 'string' && /^kimi-k3(?:[-.]|$)/i.test(model.trim());
}

export function isOfficialMoonshotURL(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    return new URL(value).hostname.toLowerCase() === 'api.moonshot.ai';
  } catch {
    return false;
  }
}

function getRequestURL(input: string | URL | Request): URL | undefined {
  try {
    return new URL(input instanceof Request ? input.url : input.toString());
  } catch {
    return undefined;
  }
}

function createSyntheticChunk(
  template: CompletionPayload,
  key: 'content' | 'reasoning_content',
  value: string,
): CompletionPayload {
  const choice = template.choices?.[0] ?? {};
  return {
    ...template,
    choices: [
      {
        ...choice,
        delta: { role: 'assistant', [key]: value },
        finish_reason: null,
      },
    ],
  };
}

function transformSSE(response: Response, prefill: KimiPrefill): Response {
  if (!response.body) {
    return response;
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let reasoningPending = prefill.reasoning;
  let responsePending = prefill.response;
  let template: CompletionPayload | undefined;

  const transformEvent = (event: string): string => {
    const dataLine = event.split(/\r?\n/).find((line) => line.startsWith('data:'));
    if (!dataLine) {
      return `${event}\n\n`;
    }

    const data = dataLine.slice(5).trimStart();
    if (data === '[DONE]') {
      let output = '';
      if (template && reasoningPending) {
        output += `data: ${JSON.stringify(
          createSyntheticChunk(template, 'reasoning_content', reasoningPending),
        )}\n\n`;
        reasoningPending = '';
      }
      if (template && responsePending) {
        output += `data: ${JSON.stringify(
          createSyntheticChunk(template, 'content', responsePending),
        )}\n\n`;
        responsePending = '';
      }
      return `${output}${event}\n\n`;
    }

    let payload: CompletionPayload;
    try {
      payload = JSON.parse(data) as CompletionPayload;
    } catch {
      return `${event}\n\n`;
    }

    template = payload;
    const choice = payload.choices?.[0];
    const delta = choice?.delta;
    if (!choice || !delta) {
      return `${event}\n\n`;
    }

    let prefixEvent = '';
    if (reasoningPending && typeof delta.content === 'string' && delta.content !== '') {
      prefixEvent = `data: ${JSON.stringify(
        createSyntheticChunk(payload, 'reasoning_content', reasoningPending),
      )}\n\n`;
      reasoningPending = '';
    }
    if (reasoningPending && typeof delta.reasoning_content === 'string') {
      delta.reasoning_content = `${reasoningPending}${delta.reasoning_content}`;
      reasoningPending = '';
    }
    if (responsePending && typeof delta.content === 'string' && delta.content !== '') {
      delta.content = `${responsePending}${delta.content}`;
      responsePending = '';
    }

    return `${prefixEvent}data: ${JSON.stringify(payload)}\n\n`;
  };

  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
          buffer = buffer.slice(boundary + separator.length);
          controller.enqueue(encoder.encode(transformEvent(event)));
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) {
          controller.enqueue(encoder.encode(transformEvent(buffer).trimEnd()));
        }
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function transformJSON(response: Response, prefill: KimiPrefill): Promise<Response> {
  let payload: CompletionPayload;
  try {
    payload = (await response.clone().json()) as CompletionPayload;
  } catch {
    return response;
  }

  const message = payload.choices?.[0]?.message;
  if (!message) {
    return response;
  }
  if (prefill.reasoning) {
    message.reasoning_content = `${prefill.reasoning}${
      typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
    }`;
  }
  if (prefill.response) {
    message.content = `${prefill.response}${typeof message.content === 'string' ? message.content : ''}`;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createKimiPrefillFetch({ fetch, prefill }: KimiPrefillFetchOptions): Fetch {
  let applied = false;

  return async (input, init) => {
    const url = getRequestURL(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const canApply =
      !applied &&
      method.toUpperCase() === 'POST' &&
      url?.hostname.toLowerCase() === 'api.moonshot.ai' &&
      /\/chat\/completions\/?$/.test(url.pathname) &&
      typeof init?.body === 'string';

    if (!canApply) {
      return fetch(input, init);
    }

    let payload: CompletionPayload;
    try {
      payload = JSON.parse(init.body as string) as CompletionPayload;
    } catch {
      return fetch(input, init);
    }
    if (!isKimiK3Model(payload.model) || !Array.isArray(payload.messages)) {
      return fetch(input, init);
    }
    const hasTools =
      (payload.tools?.length ?? 0) > 0 ||
      payload.messages.some(
        (message) => message.role === 'tool' || Array.isArray(message.tool_calls),
      );
    if (hasTools || payload.response_format?.type === 'json_schema') {
      return fetch(input, init);
    }

    applied = true;
    let response: Response;
    try {
      response = await fetch(input, {
        ...init,
        body: JSON.stringify({
          ...payload,
          messages: [
            ...payload.messages,
            {
              role: 'assistant',
              content: prefill.response,
              reasoning_content: prefill.reasoning,
              partial: true,
            },
          ],
        }),
      });
    } catch (error) {
      applied = false;
      throw error;
    }
    if (!response.ok) {
      applied = false;
      return response;
    }

    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('text/event-stream')
      ? transformSSE(response, prefill)
      : transformJSON(response, prefill);
  };
}
