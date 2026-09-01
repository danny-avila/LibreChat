import type { TDefaultLLMDeliveryPathConfig } from './file-config';
import {
  isNativelyReadableText,
  canToolResourceConsume,
  resolveUploadDestination,
  resolveDefaultLLMDeliveryPath,
  SYSTEM_LLM_DELIVERY_DEFAULTS,
} from './resolve-llm-delivery-path';

describe('resolveDefaultLLMDeliveryPath', () => {
  it('should return system default for images when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('image/png')).toBe('provider');
  });

  it('should return system default for PDFs when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf')).toBe('provider');
  });

  it('should return system default for videos when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('video/mp4')).toBe('provider');
  });

  it('should return system default for audio when no config provided', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg')).toBe('provider');
  });

  it('should return system fallback for unknown mime types', () => {
    expect(resolveDefaultLLMDeliveryPath('text/plain')).toBe('text');
  });

  it('should match exact mime type before wildcard', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/png': 'text', 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', config)).toBe('text');
  });

  it('should match wildcard when no exact match', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'none' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/jpeg', config)).toBe('none');
  });

  it('should use config fallback when no override matches', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      fallback: 'none',
      overrides: { 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('text/plain', config)).toBe('none');
  });

  it('should resolve endpoint config before global config', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'text' },
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe('text');
  });

  it('should fall through to global config when endpoint has no match', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'audio/*': 'none' },
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'text' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe('text');
  });

  it('should use endpoint fallback before global overrides', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {
      fallback: 'none',
    };
    const globalConfig: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'text/*': 'provider' },
    };
    expect(resolveDefaultLLMDeliveryPath('text/plain', endpointConfig, globalConfig)).toBe('none');
  });

  it('should fall through entire chain to system defaults', () => {
    const endpointConfig: TDefaultLLMDeliveryPathConfig = {};
    const globalConfig: TDefaultLLMDeliveryPathConfig = {};
    expect(resolveDefaultLLMDeliveryPath('image/png', endpointConfig, globalConfig)).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', endpointConfig, globalConfig)).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('text/csv', endpointConfig, globalConfig)).toBe('text');
  });

  it('should resolve none destination correctly', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'audio/*': 'none' },
    };
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', config)).toBe('none');
  });

  it('should prefer exact match over wildcard in the same config', () => {
    const config: TDefaultLLMDeliveryPathConfig = {
      overrides: { 'image/*': 'provider', 'image/svg+xml': 'text' },
    };
    expect(resolveDefaultLLMDeliveryPath('image/svg+xml', config)).toBe('text');
    expect(resolveDefaultLLMDeliveryPath('image/png', config)).toBe('provider');
  });

  it('should handle undefined configs gracefully', () => {
    expect(resolveDefaultLLMDeliveryPath('text/plain', undefined, undefined)).toBe('text');
  });

  it('routes PDFs to text for a known endpoint without native document support', () => {
    expect(
      resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'azureOpenAI'),
    ).toBe('text');
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'azureOpenAI')).toBe(
      'text',
    );
  });

  it('keeps unsupported video off the model path rather than parsing it as text', () => {
    /* Nothing extracts text from video: speech-to-text covers audio only, and the default
     * text matcher accepts any well-formed type, so a downgrade to text ends in raw bytes
     * decoded as UTF-8. */
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'azureOpenAI')).toBe(
      'none',
    );
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'anthropic')).toBe(
      'none',
    );
  });

  it('keeps archives and columnar data off the text fallback', () => {
    /* These land on the text fallback rather than the capability gate, and the default
     * text matcher accepts them, so they would be decoded as UTF-8 into the prompt. */
    for (const mimeType of [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/epub+zip',
      'application/vnd.apache.parquet',
      /* No built-in parser handles presentations or drawings, so without OCR they would
       * reach the same raw-bytes fallback. */
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'application/vnd.oasis.opendocument.graphics',
      /* Legacy DOC is absent from documentParserMimeTypes, so it has no parser either. */
      'application/msword',
    ]) {
      expect(resolveDefaultLLMDeliveryPath(mimeType, undefined, undefined, 'openAI')).toBe('none');
    }
  });

  it('keeps recoverable types on the text fallback', () => {
    for (const mimeType of [
      'text/plain',
      'text/csv',
      'application/json',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'message/rfc822',
    ]) {
      expect(resolveDefaultLLMDeliveryPath(mimeType, undefined, undefined, 'openAI')).toBe('text');
    }
  });

  it('still honors an explicit override for an unparsable type', () => {
    expect(
      resolveDefaultLLMDeliveryPath(
        'application/zip',
        { overrides: { 'application/zip': 'text' } },
        undefined,
        'openAI',
      ),
    ).toBe('text');
  });

  it('still honors an explicit override for video', () => {
    /* Capability gating applies to the system default only; an admin who configures a
     * destination has made the decision. */
    expect(
      resolveDefaultLLMDeliveryPath(
        'video/mp4',
        { overrides: { 'video/*': 'text' } },
        undefined,
        'anthropic',
      ),
    ).toBe('text');
  });

  it('keeps provider delivery for endpoints that do support documents', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'google')).toBe(
      'provider',
    );
  });

  it('routes transcribable media to text for providers without media encoders', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'openAI')).toBe(
      'text',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'openAI')).toBe(
      'provider',
    );
  });

  it('keeps provider delivery for endpoints with real media encoders', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'google')).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'openrouter')).toBe(
      'provider',
    );
  });

  it('keeps images on the provider path regardless of document support', () => {
    expect(resolveDefaultLLMDeliveryPath('image/png', undefined, undefined, 'azureOpenAI')).toBe(
      'provider',
    );
  });

  it('does not downgrade when the endpoint is unknown', () => {
    expect(resolveDefaultLLMDeliveryPath('application/pdf')).toBe('provider');
  });

  it('lets explicit config override the capability gate', () => {
    expect(
      resolveDefaultLLMDeliveryPath(
        'application/pdf',
        { overrides: { 'application/pdf': 'provider' } },
        undefined,
        'azureOpenAI',
      ),
    ).toBe('provider');
  });

  it('routes Bedrock document types through the provider on bedrock', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, undefined, undefined, 'bedrock')).toBe('provider');
    expect(
      resolveDefaultLLMDeliveryPath('application/msword', undefined, undefined, 'bedrock'),
    ).toBe('provider');
  });

  it('keeps Bedrock document types on text for other endpoints', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, undefined, undefined, 'openAI')).toBe('text');
    expect(resolveDefaultLLMDeliveryPath(docx)).toBe('text');
  });

  it('lets explicit config override the Bedrock document default', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(resolveDefaultLLMDeliveryPath(docx, { fallback: 'text' }, undefined, 'bedrock')).toBe(
      'text',
    );
  });

  it('keeps the system default when the provider is unresolved (agents container)', () => {
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'agents')).toBe(
      'provider',
    );
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'agents')).toBe(
      'provider',
    );
  });

  it('keeps documents on the provider path for a custom endpoint name', () => {
    /* A custom endpoint is usually OpenAI- or Anthropic-compatible, and both carry
     * documents, so judging capability from a name we cannot identify would downgrade
     * something the real provider delivers. */
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'MyOpenAI')).toBe(
      'provider',
    );
  });

  it('downgrades media for a custom endpoint name', () => {
    /* Media is different: the encoders emit a payload only for the providers they name,
     * so a custom endpoint receives nothing whatever it proxies to. Left on the provider
     * path the model gets neither the media nor a transcript. */
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'MyOpenAI')).toBe(
      'text',
    );
    expect(resolveDefaultLLMDeliveryPath('video/mp4', undefined, undefined, 'MyOpenAI')).toBe(
      'none',
    );
  });

  it('leaves media alone when no endpoint is resolved at all', () => {
    /* An ephemeral agent reports no usable endpoint, which is not the same as naming one
     * we cannot identify. */
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg')).toBe('provider');
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'agents')).toBe(
      'provider',
    );
  });

  it('keeps audio off the text path where nothing transcribes it', () => {
    /* Audio's text path is speech to text, so with no provider configured routing it
     * there sends the upload to a service that is not running and fails it. */
    expect(
      resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'openAI', undefined, false),
    ).toBe('none');
    expect(
      resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'openAI', undefined, true),
    ).toBe('text');
    /* Unknown is not absent: a caller that does not say keeps the existing answer. */
    expect(resolveDefaultLLMDeliveryPath('audio/mpeg', undefined, undefined, 'openAI')).toBe(
      'text',
    );
  });

  it('honors the Responses API when routing Azure documents', () => {
    /* Azure is out of the document set because native documents need Responses, so the
     * encoder's own condition decides rather than the endpoint alone. */
    expect(
      resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'azureOpenAI'),
    ).toBe('text');
    expect(
      resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'azureOpenAI', true),
    ).toBe('provider');
  });

  it('should export SYSTEM_LLM_DELIVERY_DEFAULTS with correct shape', () => {
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.fallback).toBe('text');
    expect(SYSTEM_LLM_DELIVERY_DEFAULTS.overrides).toEqual({
      'image/*': 'provider',
      'video/*': 'provider',
      'audio/*': 'provider',
      'application/pdf': 'provider',
    });
  });
});

describe('resolveUploadDestination', () => {
  const base = { mimeType: 'application/zip', hasAgent: true, isMessageAttachment: false };

  it('keeps an explicit resource and normalizes ocr to context', () => {
    expect(
      resolveUploadDestination({ ...base, toolResource: 'ocr', deliveryPath: 'text' }).toolResource,
    ).toBe('context');
    expect(
      resolveUploadDestination({ ...base, toolResource: 'file_search', deliveryPath: 'none' })
        .toolResource,
    ).toBe('file_search');
  });

  it('promotes a text-routed upload to context', () => {
    expect(resolveUploadDestination({ ...base, deliveryPath: 'text' }).toolResource).toBe(
      'context',
    );
  });

  it('does not refuse an upload for having no consumer on the agent record', () => {
    /* A skill can contribute file search or code execution for the turn without appearing
     * in agent.tools, so an empty list is not evidence that nothing will read the file. */
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'none',
        agentTools: [],
        isMessageAttachment: true,
      }).rejection,
    ).toBeUndefined();
  });

  it('does not judge an unknown tool set', () => {
    /* An ephemeral agent has no record, so its tools are unknown rather than absent. */
    expect(resolveUploadDestination({ ...base, deliveryPath: 'none' }).rejection).toBe(
      'no-agent-resource',
    );
    expect(
      resolveUploadDestination({ ...base, deliveryPath: 'none', isMessageAttachment: true })
        .rejection,
    ).toBeUndefined();
  });

  it('passes over a tool that cannot read the type, whatever order they are listed in', () => {
    /* An archive: only code execution can take it, so search listed first must not win. */
    for (const agentTools of [
      ['file_search', 'execute_code'],
      ['execute_code', 'file_search'],
    ]) {
      expect(
        resolveUploadDestination({
          ...base,
          mimeType: 'application/zip',
          deliveryPath: 'none',
          agentTools,
        }).toolResource,
      ).toBe('execute_code');
    }
  });

  it('picks a consumer that can read the type, whatever order the tools are listed in', () => {
    /* file_search indexes extracted text and has nothing to do with an image, so choosing
     * it would make the upload fail on a rule the agent's tool order decided. */
    for (const agentTools of [
      ['file_search', 'execute_code'],
      ['execute_code', 'file_search'],
    ]) {
      expect(
        resolveUploadDestination({
          ...base,
          mimeType: 'image/png',
          deliveryPath: 'none',
          agentTools,
        }).toolResource,
      ).toBe('execute_code');
    }
  });

  it('files a permanent upload under the tool that will consume it', () => {
    expect(
      resolveUploadDestination({ ...base, deliveryPath: 'none', agentTools: ['execute_code'] })
        .toolResource,
    ).toBe('execute_code');
  });

  it('refuses a permanent text upload when the context capability is off', () => {
    /* Priming skips context ids entirely when the capability is off, so storing one
     * reports success and leaves the agent a file it can never open. */
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'text',
        contextEnabled: false,
      }).rejection,
    ).toBe('context-disabled');
    expect(
      resolveUploadDestination({
        ...base,
        toolResource: 'ocr',
        deliveryPath: 'text',
        contextEnabled: false,
      }).rejection,
    ).toBe('context-disabled');
  });

  it('leaves message attachments and unknown capability alone', () => {
    /* A message attachment is delivered with the turn rather than stored on the agent,
     * and an unlooked-up capability is not judged. */
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'text',
        isMessageAttachment: true,
        contextEnabled: false,
      }).toolResource,
    ).toBe('context');
    expect(resolveUploadDestination({ ...base, deliveryPath: 'text' }).toolResource).toBe(
      'context',
    );
  });

  it('refuses a permanent upload that would land on no agent resource', () => {
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'provider',
        agentTools: [],
      }).rejection,
    ).toBe('no-agent-resource');
  });

  it('refuses a none-routed upload with no agent behind it', () => {
    /* Nothing provisions in a conversation with no agent, so a file kept off the model
     * path there is reachable by nothing at all. */
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'none',
        hasAgent: false,
        isMessageAttachment: true,
      }).rejection,
    ).toBe('no-consumer');
  });

  it('does not judge an agent conversation the same way', () => {
    /* An agent's tool set is not knowable at upload: a skill can contribute file search
     * or code execution for the turn without appearing in agent.tools. */
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'none',
        agentTools: [],
        isMessageAttachment: true,
      }).rejection,
    ).toBeUndefined();
  });

  it('leaves a message attachment unclaimed', () => {
    expect(
      resolveUploadDestination({
        ...base,
        deliveryPath: 'provider',
        isMessageAttachment: true,
      }),
    ).toEqual({});
  });
});

describe('isNativelyReadableText', () => {
  it('admits the application types whose payload is text', () => {
    /* Kept in step with the textual set in the content-protection code. Missing one sends
     * a readable file down the extractor path, where no parser claims it and it is lost. */
    for (const mimeType of [
      'application/json',
      'application/javascript',
      'application/sql',
      'application/xml',
      'application/x-yaml',
      'application/yaml',
      'text/markdown',
      'message/rfc822',
    ]) {
      expect(isNativelyReadableText(mimeType)).toBe(true);
    }
  });

  it('rejects types whose bytes are not text', () => {
    for (const mimeType of ['application/zip', 'application/pdf', 'image/png']) {
      expect(isNativelyReadableText(mimeType)).toBe(false);
    }
  });

  it('ignores parameters and case, as browsers send both', () => {
    expect(isNativelyReadableText('text/plain; charset=utf-8')).toBe(true);
    expect(isNativelyReadableText('Application/JSON')).toBe(true);
  });
});

describe('canToolResourceConsume', () => {
  it('judges each tool by the list the client offers it from', () => {
    /* An archive is readable by the code interpreter and not by the vector store, so
     * treating everything non-image as searchable sent it to RAG to be rejected. */
    expect(canToolResourceConsume('file_search', 'image/png')).toBe(false);
    expect(canToolResourceConsume('file_search', 'application/zip')).toBe(false);
    expect(canToolResourceConsume('file_search', 'video/mp4')).toBe(false);
    expect(canToolResourceConsume('file_search', 'audio/mpeg')).toBe(false);
    expect(canToolResourceConsume('file_search', 'application/pdf')).toBe(true);
    /* The vector store handles more than the historical retrieval list, and a data file
     * is a normal thing to search. */
    expect(canToolResourceConsume('file_search', 'text/csv')).toBe(true);
    expect(canToolResourceConsume('execute_code', 'application/zip')).toBe(true);
    expect(canToolResourceConsume('execute_code', 'image/png')).toBe(true);
  });
});

describe('provider document capability', () => {
  it('keeps Bedrock documents on the provider path', () => {
    /* Bedrock is in documentSupportedProviders, so the capability downgrade does not
     * apply to it. Pinned because the Converse document path handles more than PDF and a
     * downgrade here would silently flatten it through extraction. */
    expect(resolveDefaultLLMDeliveryPath('application/pdf', undefined, undefined, 'bedrock')).toBe(
      'provider',
    );
    expect(
      resolveDefaultLLMDeliveryPath(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        undefined,
        undefined,
        'bedrock',
      ),
    ).toBe('provider');
  });
});
