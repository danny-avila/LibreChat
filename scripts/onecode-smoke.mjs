const rawBaseUrl = process.env.ONECODE_API_BASE_URL ?? 'http://localhost:19080/v1';
const baseUrl = rawBaseUrl.replace(/\/$/, '');
const token = process.env.ONECODE_API_TOKEN ?? 'dev-local-token';

const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
};

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const root = baseUrl.endsWith('/v1') ? baseUrl.slice(0, -3) : baseUrl;
  const health = await request(`${root}/health`);
  console.log('health:', JSON.stringify(health));

  const models = await request(`${baseUrl}/models`);
  console.log('models:', JSON.stringify(models));

  const chat = await request(`${baseUrl}/chat/completions`, {
    method: 'POST',
    body: JSON.stringify({
      model: 'onecode-agent',
      messages: [{ role: 'user', content: 'Inspect this project in one sentence' }],
      stream: false,
    }),
  });
  console.log('chat:', JSON.stringify(chat).slice(0, 1000));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
