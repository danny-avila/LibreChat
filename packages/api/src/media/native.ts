import { Readable } from 'node:stream';
import { EModelEndpoint } from 'librechat-data-provider';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { MediaNativeMethods, MediaStoredJob } from '@librechat/data-schemas';
import type { MediaIntegration } from 'librechat-data-provider';
import type { NativeMediaPort } from '@librechat/agents';
import type { MediaContext, MediaServiceDependencies } from './service';
import { assertMediaAccess } from './service';
import { MediaServiceError } from './errors';

export interface NativeMediaSelection {
  provider: string;
  model: string;
  agentId?: string;
  responseModalities?: string[];
  apiKey?: string;
  baseURL?: string;
}
export type NativeMediaFactory = (
  selection: NativeMediaSelection,
) => Promise<NativeMediaPort | undefined>;
export interface MediaChatSource {
  conversationId: string;
  messageId: string;
  prompt: string;
  temporary: boolean;
}

function secretsMatch(candidate: string | undefined, expected: string | undefined): boolean {
  if (candidate == null || expected == null) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The SDK owns the model invocation and chat debit; this port records its ordered output. */
export function createNativeMediaFactory({
  deps,
  repository,
  context,
  source,
}: {
  deps: MediaServiceDependencies;
  repository: MediaNativeMethods;
  context: MediaContext;
  source: MediaChatSource;
}): NativeMediaFactory {
  return async (selection) => {
    if (selection.provider.toLowerCase() !== 'google') {
      return undefined;
    }
    const integration = context.config.integrations.find(
      (entry) =>
        entry.enabled !== false &&
        entry.api === 'google.generateContent' &&
        entry.endpointRef.kind === 'builtin' &&
        entry.endpointRef.endpoint === 'google' &&
        (entry.catalog.kind === 'configured'
          ? entry.catalog.models
          : entry.catalog.allowModels
        ).includes(selection.model),
    );
    const modalities = selection.responseModalities ?? (integration ? ['TEXT', 'IMAGE'] : ['TEXT']);
    const wantsImages = modalities.some((modality) => modality.toUpperCase() === 'IMAGE');
    const historyIntegration: MediaIntegration = integration ?? {
      id: 'native-google-history',
      api: 'google.generateContent',
      endpointRef: { kind: 'builtin', endpoint: EModelEndpoint.google },
      catalog: { kind: 'configured', models: [selection.model] },
      operations: ['image.generate'],
    };
    const connection = await deps.resolveConnection({
      scope: context.scope,
      integration: historyIntegration,
      appConfig: context.appConfig,
      minValidityMs: context.config.credentials.minValidityAtDispatchMs,
    });
    if (connection) {
      const base = (value: string) => value.replace(/\/$/, '').replace(/\/v1beta$/, '');
      const keyMatches = secretsMatch(selection.apiKey, connection.headers['x-goog-api-key']);
      const urlMatches =
        base(selection.baseURL ?? 'https://generativelanguage.googleapis.com') ===
        base(connection.baseURL);
      if (!keyMatches || !urlMatches) {
        throw new MediaServiceError(
          'credentials_required',
          403,
          'Native media must use the configured Google connection.',
        );
      }
    }
    const execution = connection
      ? {
          connectionId: historyIntegration.id,
          endpointRef: historyIntegration.endpointRef,
          modelId: selection.model,
          api: connection.api,
          catalogVersion: 'native-chat',
          bindingRevision: connection.binding,
          accountingMode: 'none' as const,
        }
      : undefined;
    const runs = new Map<string, MediaStoredJob>();
    const imageKeys = new Map<string, Set<string>>();
    const getRun = (modelRunId: string) => {
      const job = runs.get(modelRunId);
      if (!job) {
        throw new MediaServiceError('not_ready', 409, 'Native media recording has not started.');
      }
      return job;
    };
    const assertOutput = () => {
      assertMediaAccess(context, true);
      if (source.prompt.length > context.config.limits.maxPromptChars) {
        throw new MediaServiceError(
          'invalid_request',
          422,
          'Native media prompt exceeds the configured limit.',
        );
      }
      if (!integration || !execution || !context.config.surfaces.chat) {
        throw new MediaServiceError(
          'unsupported',
          422,
          'Enable this Google image model in media configuration.',
        );
      }
      if (source.temporary) {
        throw new MediaServiceError(
          'unsupported',
          422,
          'Native media generation requires a saved conversation.',
        );
      }
      if ((context.config.assets.source ?? context.appConfig.fileStrategy) !== 'local') {
        throw new MediaServiceError(
          'unsupported',
          422,
          'Native media requires an available storage adapter.',
        );
      }
    };
    return {
      async start({ modelRunId, model, signal }) {
        if (!wantsImages) {
          return { responseModalities: modalities };
        }
        assertOutput();
        if (signal?.aborted || model !== selection.model || !execution) {
          throw new MediaServiceError(
            'invalid_request',
            400,
            'The native model invocation changed.',
          );
        }
        if (runs.size >= context.config.execution.maxActivePerUser) {
          throw new MediaServiceError(
            'quota_exceeded',
            429,
            'Too many native recordings are active.',
          );
        }
        const clientRequestId = createHash('sha256')
          .update(JSON.stringify({ ...source, modelRunId }))
          .digest('hex');
        const job = await repository.startMediaNativeRecording({
          scope: context.scope,
          source: {
            conversationId: source.conversationId,
            messageId: source.messageId,
            modelRunId,
          },
          execution,
          request: {
            schemaVersion: 1,
            clientRequestId,
            operation: 'image.generate',
            prompt: source.prompt,
            selection: {
              connectionId: execution.connectionId,
              modelId: execution.modelId,
              catalogVersion: execution.catalogVersion,
            },
            inputs: [],
            parameters: { count: 1 },
          },
          maxRetainers: context.config.limits.maxAssetRetainers,
          maxTitleChars: context.config.limits.maxTitleChars,
          limits: {
            maxParts: context.config.limits.maxNativeParts,
            maxPartBytes: context.config.limits.maxNativePartBytes,
            maxRecordingBytes: context.config.limits.maxNativeRecordingBytes,
          },
        });
        runs.set(modelRunId, job);
        imageKeys.set(modelRunId, new Set());
        return { responseModalities: modalities };
      },
      async part({ modelRunId, chunkIndex, partIndex, part }) {
        if (!wantsImages) {
          if (part.kind !== 'text') {
            assertOutput();
            throw new MediaServiceError(
              'unsupported',
              422,
              'Image output was not enabled for this invocation.',
            );
          }
          return { type: 'text', text: part.text };
        }
        const job = getRun(modelRunId);
        if (part.kind === 'text') {
          const reference = await repository.recordMediaNativePart({
            scope: context.scope,
            jobId: job.jobId,
            chunkIndex,
            partIndex,
            part,
            maxRetainers: context.config.limits.maxAssetRetainers,
          });
          return { type: 'text', text: part.text, native_media: reference };
        }
        const positions = imageKeys.get(modelRunId)!;
        const position = `${chunkIndex}:${partIndex}`;
        if (!positions.has(position) && positions.size >= context.config.limits.maxOutputs) {
          throw new MediaServiceError(
            'quota_exceeded',
            429,
            'The native image output limit was reached.',
          );
        }
        if (
          part.data.length > Math.ceil(context.config.transfers.maxImageBytes / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(part.data)
        ) {
          throw new MediaServiceError(
            'invalid_request',
            413,
            'Native image exceeds the configured limit.',
          );
        }
        const asset = await deps.storage.publish({
          scope: context.scope,
          outputKey: `${job.jobId}:native:${chunkIndex}:${partIndex}`,
          stream: Readable.from([Buffer.from(part.data, 'base64')]),
          type: part.mimeType,
          filename: `${job.jobId}-${chunkIndex}-${partIndex}.${part.mimeType.split('/')[1]}`,
          config: context.config,
          expiredAt: new Date(deps.now() + context.config.assets.orphanRetentionMs).toISOString(),
        });
        const reference = await repository.recordMediaNativePart({
          scope: context.scope,
          jobId: job.jobId,
          chunkIndex,
          partIndex,
          part: {
            kind: 'image',
            mimeType: part.mimeType,
            fileId: asset.file_id,
            thoughtSignature: part.thoughtSignature,
          },
          maxRetainers: context.config.limits.maxAssetRetainers,
        });
        positions.add(position);
        return { type: 'image_file', image_file: asset, native_media: reference };
      },
      async complete({ modelRunId }) {
        const job = runs.get(modelRunId);
        if (!job) {
          return;
        }
        await repository.completeMediaNativeRecording({ scope: context.scope, jobId: job.jobId });
        runs.delete(modelRunId);
        imageKeys.delete(modelRunId);
      },
      async fail({ modelRunId, reason }) {
        const job = runs.get(modelRunId);
        if (!job) {
          return;
        }
        await repository.failMediaNativeRecording({
          scope: context.scope,
          jobId: job.jobId,
          reason,
        });
        runs.delete(modelRunId);
        imageKeys.delete(modelRunId);
      },
      async restore({ file_id, continuationRef }) {
        assertMediaAccess(context);
        if (!execution) {
          throw new MediaServiceError(
            'credentials_required',
            403,
            'The original Google connection is unavailable.',
          );
        }
        const stored = await repository.getMediaNativeContinuation({
          scope: context.scope,
          execution,
          fileId: file_id,
          continuationRef,
        });
        if (!stored) {
          throw new MediaServiceError(
            'not_found',
            404,
            'Native continuation is unavailable for this connection.',
          );
        }
        if (stored.part.kind === 'text') {
          return stored.part;
        }
        const { asset, data } = await deps.storage.read(
          context.scope,
          stored.part.fileId,
          context.config.transfers.maxImageBytes,
        );
        return {
          kind: 'image',
          mimeType: asset.type,
          data: data.toString('base64'),
          thoughtSignature: stored.part.thoughtSignature,
        };
      },
    };
  };
}
