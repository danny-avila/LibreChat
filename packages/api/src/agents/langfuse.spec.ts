import { LANGFUSE_SECRET_CLEAR_VALUE } from 'librechat-data-provider';

import { normalizeLangfuseConfig, redactLangfuseSecret } from './langfuse';

describe('normalizeLangfuseConfig', () => {
  it('returns undefined for non-object input', async () => {
    await expect(normalizeLangfuseConfig('not-object')).resolves.toBeUndefined();
  });

  it('preserves env var refs instead of encrypting them', async () => {
    const result = await normalizeLangfuseConfig({
      enabled: true,
      secretKey: '${LANGFUSE_SECRET_KEY}',
    });

    expect(result).toEqual({
      enabled: true,
      secretKey: '${LANGFUSE_SECRET_KEY}',
    });
  });

  it('clears an existing secret when the clear sentinel is sent', async () => {
    const result = await normalizeLangfuseConfig(
      {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: LANGFUSE_SECRET_CLEAR_VALUE,
      },
      {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: '0123456789abcdef0123456789abcdef:736b2d6167656e74',
      },
    );

    expect(result).toEqual({
      enabled: true,
      publicKey: 'pk-agent',
    });
  });

  it('preserves existing non-secret fields when clearing only the secret', async () => {
    const result = await normalizeLangfuseConfig(
      {
        secretKey: LANGFUSE_SECRET_CLEAR_VALUE,
      },
      {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: '0123456789abcdef0123456789abcdef:736b2d6167656e74',
        baseUrl: 'https://cloud.langfuse.com',
      },
    );

    expect(result).toEqual({
      enabled: true,
      publicKey: 'pk-agent',
      baseUrl: 'https://cloud.langfuse.com',
    });
  });

  it('returns undefined when clearing the only stored field', async () => {
    const result = await normalizeLangfuseConfig(
      {
        secretKey: LANGFUSE_SECRET_CLEAR_VALUE,
      },
      {
        secretKey: '0123456789abcdef0123456789abcdef:736b2d6167656e74',
      },
    );

    expect(result).toBeUndefined();
  });

  it('clears explicit blank non-secret fields while preserving absent fields', async () => {
    const result = await normalizeLangfuseConfig(
      {
        publicKey: '',
        secretKey: LANGFUSE_SECRET_CLEAR_VALUE,
      },
      {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: '0123456789abcdef0123456789abcdef:736b2d6167656e74',
        baseUrl: 'https://cloud.langfuse.com',
      },
    );

    expect(result).toEqual({
      enabled: true,
      baseUrl: 'https://cloud.langfuse.com',
    });
  });
});

describe('redactLangfuseSecret', () => {
  it('redacts top-level and version Langfuse secrets without mutating the input', () => {
    const agent = {
      id: 'agent_1',
      langfuse: {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: 'sk-agent',
      },
      versions: [
        {
          langfuse: {
            secretKey: 'sk-version',
          },
        },
      ],
    };

    const result = redactLangfuseSecret(agent);

    expect(result).toEqual({
      id: 'agent_1',
      langfuse: {
        enabled: true,
        publicKey: 'pk-agent',
        secretKey: '',
      },
      versions: [
        {
          langfuse: {
            secretKey: '',
          },
        },
      ],
    });
    expect(agent.langfuse.secretKey).toBe('sk-agent');
    expect(agent.versions[0].langfuse.secretKey).toBe('sk-version');
  });

  it('returns the original object when there is nothing to redact', () => {
    const agent = { id: 'agent_1', name: 'No Langfuse' };

    expect(redactLangfuseSecret(agent)).toBe(agent);
  });
});
