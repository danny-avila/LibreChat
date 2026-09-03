import { createKimiPrefillFetch, isKimiK3Model, isOfficialMoonshotURL } from './prefill';

const url = 'https://api.moonshot.ai/v1/chat/completions';

function requestBody(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as {
    messages: Array<Record<string, unknown>>;
  };
}

describe('Kimi K3 native prefill', () => {
  it('recognizes only K3 and the official Moonshot host', () => {
    expect(isKimiK3Model('kimi-k3')).toBe(true);
    expect(isKimiK3Model('kimi-k3-turbo')).toBe(true);
    expect(isKimiK3Model('kimi-k2.6')).toBe(false);
    expect(isOfficialMoonshotURL('https://api.moonshot.ai/v1')).toBe(true);
    expect(isOfficialMoonshotURL('https://api.moonshot.ai.evil.test/v1')).toBe(false);
  });

  it('adds native Partial Mode to only the first successful request', async () => {
    const bodies: Array<{ messages: Array<Record<string, unknown>> }> = [];
    const baseFetch = jest.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(requestBody(init));
      return new Response(
        JSON.stringify({
          choices: [
            { message: { reasoning_content: 'continued thought', content: 'continued text' } },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const fetch = createKimiPrefillFetch({
      fetch: baseFetch,
      prefill: { reasoning: 'think ', response: 'reply ' },
    });
    const init = {
      method: 'POST',
      body: JSON.stringify({ model: 'kimi-k3', messages: [{ role: 'user', content: 'Hi' }] }),
    };

    const first = await fetch(url, init);
    await fetch(url, init);

    expect(bodies[0].messages[bodies[0].messages.length - 1]).toEqual({
      role: 'assistant',
      content: 'reply ',
      reasoning_content: 'think ',
      partial: true,
    });
    expect(bodies[1].messages).toHaveLength(1);
    await expect(first.json()).resolves.toMatchObject({
      choices: [
        {
          message: {
            reasoning_content: 'think continued thought',
            content: 'reply continued text',
          },
        },
      ],
    });
  });

  it('does not consume the prefill when Moonshot returns an error', async () => {
    const bodies: Array<{ messages: Array<Record<string, unknown>> }> = [];
    const baseFetch = jest
      .fn()
      .mockImplementationOnce(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(requestBody(init));
        return new Response('failed', { status: 500 });
      })
      .mockImplementationOnce(async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(requestBody(init));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    const fetch = createKimiPrefillFetch({
      fetch: baseFetch,
      prefill: { reasoning: 'think', response: '' },
    });
    const init = {
      method: 'POST',
      body: JSON.stringify({ model: 'kimi-k3', messages: [] }),
    };

    await fetch(url, init);
    await fetch(url, init);

    expect(bodies[0].messages[bodies[0].messages.length - 1]?.partial).toBe(true);
    expect(bodies[1].messages[bodies[1].messages.length - 1]?.partial).toBe(true);
  });

  it('prefixes streamed reasoning and response deltas exactly once', async () => {
    const stream = [
      'data: {"id":"1","choices":[{"index":0,"delta":{"reasoning_content":"continued thought"}}]}',
      'data: {"id":"1","choices":[{"index":0,"delta":{"content":"continued text"}}]}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    const fetch = createKimiPrefillFetch({
      fetch: async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      prefill: { reasoning: 'think ', response: 'reply ' },
    });

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ model: 'kimi-k3', messages: [] }),
    });
    const output = await response.text();

    expect(output).toContain('"reasoning_content":"think continued thought"');
    expect(output).toContain('"content":"reply continued text"');
    expect(output.match(/think /g)).toHaveLength(1);
    expect(output.match(/reply /g)).toHaveLength(1);
  });

  it('leaves non-K3 requests unchanged', async () => {
    let body = '';
    const fetch = createKimiPrefillFetch({
      fetch: async (_input, init) => {
        body = String(init?.body);
        return new Response('{}', { status: 200 });
      },
      prefill: { reasoning: 'think', response: 'reply' },
    });
    const original = JSON.stringify({ model: 'kimi-k2.6', messages: [] });

    await fetch(url, { method: 'POST', body: original });

    expect(body).toBe(original);
  });
});
