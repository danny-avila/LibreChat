import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { createModerationCheck } from './moderation';

test('shared moderation uses configured endpoint credentials, all inputs and fails closed on malformed replies', async () => {
  const calls: InternalAxiosRequestConfig[] = [];
  let data: object = { results: [{ flagged: false }, { flagged: true }] };
  const http = axios.create({
    adapter: async (config) => {
      calls.push(config);
      return { config, data, status: 200, statusText: 'OK', headers: {} };
    },
  });
  const environment = {
    OPENAI_MODERATION: 'true',
    OPENAI_MODERATION_REVERSE_PROXY: 'https://moderation.example/check',
    OPENAI_MODERATION_API_KEY: 'existing-key',
  };
  const moderate = createModerationCheck({ http, environment });
  expect(await moderate(['prompt', 'negative prompt'])).toBe(true);
  expect(calls[0].url).toBe(environment.OPENAI_MODERATION_REVERSE_PROXY);
  expect(calls[0].headers.Authorization).toBe('Bearer existing-key');
  expect(JSON.parse(calls[0].data).input).toEqual(['prompt', 'negative prompt']);
  data = { results: [] };
  await expect(moderate(['prompt'])).rejects.toThrow();
  environment.OPENAI_MODERATION = 'false';
  expect(await moderate(['prompt'])).toBe(false);
  expect(calls).toHaveLength(2);
});
