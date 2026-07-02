const RESPONSE_METADATA_SCALAR_FIELDS = [
  'model_name',
  'finish_reason',
  'model_provider',
  'service_tier',
  'finishReason',
  'stop_reason',
  'stopReason',
] as const;

interface ResponseMetadata {
  [key: string]: unknown;
}

interface MessageWithResponseMetadata {
  response_metadata?: ResponseMetadata;
}

interface GenerationWithMessage {
  message?: MessageWithResponseMetadata;
}

interface LLMEndOutput {
  generations?: Array<Array<GenerationWithMessage | undefined> | undefined>;
}

function collapseRepeatedString(value: string): string {
  for (let size = 1; size <= value.length / 2; size++) {
    if (value.length % size !== 0) {
      continue;
    }
    const segment = value.slice(0, size);
    if (segment.repeat(value.length / size) === value) {
      return segment;
    }
  }
  return value;
}

function normalizeResponseMetadata(metadata: ResponseMetadata): void {
  for (const field of RESPONSE_METADATA_SCALAR_FIELDS) {
    const value = metadata[field];
    if (typeof value === 'string' && value !== '') {
      metadata[field] = collapseRepeatedString(value);
    }
  }
}

export function normalizeLangChainResponseMetadata(output: LLMEndOutput): void {
  for (const generationList of output.generations ?? []) {
    for (const generation of generationList ?? []) {
      const metadata = generation?.message?.response_metadata;
      if (metadata) {
        normalizeResponseMetadata(metadata);
      }
    }
  }
}

export function createResponseMetadataCallback() {
  return {
    handleLLMEnd: normalizeLangChainResponseMetadata,
  };
}
