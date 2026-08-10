import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { TEndpoint } from '../src/types';
import { configSchema } from '../src/config';
import { Providers } from '../src/schemas';

const examplePath = path.resolve(__dirname, '../../..', 'librechat.example.yaml');
const exampleText = readFileSync(examplePath, 'utf8');
const example = yaml.load(exampleText);

describe('the public BAML endpoint example', () => {
  it('parses through the real public grammar with the exact registry and current prices', () => {
    const parsed = configSchema.strict().parse(example);
    const endpoints = parsed.endpoints?.custom as TEndpoint[] | undefined;
    const baml = endpoints?.find((endpoint) => endpoint.name === 'Team-BAML');

    expect(baml).toEqual(
      expect.objectContaining({
        name: 'Team-BAML',
        provider: Providers.BAML,
        models: { default: ['OpenRouter', 'OpenRouterFast'], fetch: false },
        tokenConfig: {
          OpenRouter: { context: 131072, prompt: 0.03, completion: 0.17 },
          OpenRouterFast: { context: 131072, prompt: 0.03, completion: 0.13 },
        },
      }),
    );
    expect(baml).not.toHaveProperty('apiKey');
    expect(baml).not.toHaveProperty('baseURL');
    expect(baml).not.toHaveProperty('headers');
  });

  it('documents compiled ownership without fake credentials or a literal baml allowlist', () => {
    const block = /# BAML compiled endpoint[\s\S]+?(?=\n {4}# [A-Z])/.exec(exampleText)?.[0] ?? '';

    expect(block).toContain('OPENROUTER_API_KEY');
    expect(block).toContain('BAML_OPENROUTER_BASE_URL');
    expect(block).toContain('https://openrouter.ai/api/v1');
    expect(block).toContain('openai/gpt-oss-120b');
    expect(block).toContain('openai/gpt-oss-20b');
    expect(block).toContain('FreePoolBackoff');
    expect(block).toContain('max_retries: 4');
    expect(block).toContain('FastPoolBackoff');
    expect(block).toContain('max_retries: 2');
    expect(block).not.toMatch(/apiKey:|baseURL:|sk-[A-Za-z0-9]/);
    expect(exampleText).toMatch(/allowedProviders:\s*\n\s*#\s+- 'Team-BAML'/);
    expect(exampleText).not.toMatch(/allowedProviders:\s*\n\s*#\s+- ['"]?baml['"]?/);
  });
});
