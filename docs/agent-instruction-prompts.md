# Versioned agent instruction prompts

Agent Builder can use inline instructions, a prompt from LibreChat's prompt library, or a text
prompt from Langfuse. Existing agents continue to use their inline `instructions` unless an
`instruction_prompt` reference is saved.

## LibreChat prompts

Choose **LibreChat prompt**, then select a prompt you can view. **Latest** resolves the newest
stored revision at the start of every run; selecting a numbered version pins that revision by its
stable record ID.
LibreChat checks the requesting user's current prompt permission each time. A deleted prompt,
missing version, empty prompt, or revoked permission stops the run with an explicit error rather
than silently using stale inline text.

## Langfuse prompts

Choose **Langfuse prompt**, enter its exact name, and select **Latest** or a positive version.
Latest requests Langfuse's `latest` label, not its default `production` label. LibreChat uses the
first available read destination in connection, tenant, then central order and accepts text prompts
only.

Successful Langfuse reads are cached for five minutes. A cached value may be reused after expiry
only for a transient network, rate-limit, or server failure. Authentication failures and missing or
deleted prompts never fall back to cached content. The builder's status and retry controls use the
same resolver as an actual run.

Langfuse credentials remain configured through **Settings > Langfuse** or the existing central
environment variables. No additional credentials are stored on the agent.

## Trace metadata

The resolved source, name, numeric version, and cache status can be attached to Langfuse traces:

```yaml
langfuse:
  trace:
    promptMetadata: true
```

This is disabled by default because prompt names can be sensitive. Prompt content is never exported
by this option.
