# Versioned agent instruction prompts

Agent Builder can use inline instructions, a prompt from LibreChat's prompt library, or a text
prompt from Langfuse. Existing agents continue to use their inline `instructions` unless an
`instruction_prompt` reference is saved.

Prompt selection and Langfuse preview requests require the opt-in
`endpoints.agents.capabilities: [instruction_prompts]` capability. Enable it after all execution
nodes support prompt references. Disabling it later preserves existing references and permits
unrelated edits; the builder disables prompt controls until it is enabled again.

## LibreChat prompts

Choose **LibreChat prompt**, then select a prompt you can view. **Deployed version** resolves the
prompt group's deployed revision at the start of every run. When the advanced prompts editor is
enabled, selecting a numbered version pins that revision by its stable record ID; otherwise Agent
Builder uses the deployed version.
LibreChat checks the requesting user's current prompt permission each time. A deleted prompt,
missing version, empty prompt, or revoked permission stops the run with an explicit error rather
than silently using stale inline text.

## Langfuse prompts

Choose **Langfuse prompt**, enter its exact name, and select **Latest** or a positive version.
Latest requests Langfuse's `latest` label, not its default `production` label. LibreChat uses the
first available read destination in connection, tenant, then central order and accepts text prompts
only. Saving binds the reference to that destination's opaque identity. Previewing or changing
its version preserves this binding; a missing saved destination produces an error instead of
selecting a same-named prompt from another project.

Central prompt reads wait for project discovery before returning a persistable reference. If
discovery is unavailable, retry after it recovers or set `LANGFUSE_PROJECT_ID` explicitly.
This project identity remains stable when central credentials rotate; no credential-derived
central identity is saved. Configured connections do not wait for unused central discovery.
The retrieval timeout includes required discovery and response parsing. Cancellation detaches the
caller from shared discovery without interrupting other requests, and cancelled reads never
populate the prompt cache.

Successful Langfuse reads are cached for five minutes. A cached value may be reused after expiry
only for a transient network, rate-limit, or server failure. Authentication failures and missing or
deleted prompts never fall back to cached content. The builder's status and retry controls use the
same resolver as an actual run.

Operators can override the cache lifetime and per-request retrieval timeout:

```yaml
langfuse:
  prompts:
    cacheTtlMs: 300000
    requestTimeoutMs: 10000
```

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
