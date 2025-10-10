import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  Parameter,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { logger } from '@librechat/data-schemas';
import type { MCPTokenMethods, TokenMethodFactoryOptions, TokenRecordPayload } from './types';
import {
  buildResourceName,
  extractEncryptedFlag,
  metadataToObject,
  objectToMetadataMap,
  resolvePrefixTemplate,
  sanitizeSegment,
  toTokenDataEnvelope,
  toTokenRecordPayload,
  withRetry,
} from './awsUtils';

const ACCESS_TYPE = 'SecureString';

export function createParameterStoreTokenMethods({
  awsConfig,
  retry,
}: TokenMethodFactoryOptions): MCPTokenMethods {
  const region = awsConfig?.region;
  const prefix = resolvePrefixTemplate(awsConfig?.parameterPrefix);
  const kmsKeyId = awsConfig?.kmsKeyId;
  const retryOptions = { ...(retry ?? {}), ...(awsConfig?.retry ?? {}) };

  const client = new SSMClient({ region });

  const toToken = (record: TokenRecordPayload) => {
    const envelope = toTokenDataEnvelope(record);
    return {
      userId: envelope.userId,
      identifier: envelope.identifier,
      type: envelope.type,
      token: envelope.token,
      createdAt: envelope.createdAt,
      expiresAt: envelope.expiresAt,
      metadata: envelope.metadata,
    } as unknown as import('@librechat/data-schemas').IToken;
  };

  const loadRecord = async (query: { userId?: string | null; identifier?: string | null }) => {
    if (!query.userId || !query.identifier) {
      return null;
    }

    const name = buildResourceName(prefix, String(query.userId), query.identifier);

    try {
      const response = await withRetry(
        () => client.send(new GetParameterCommand({ Name: name, WithDecryption: true })),
        retryOptions,
      );

      if (!response.Parameter?.Value) {
        return null;
      }

      const record = JSON.parse(response.Parameter.Value) as TokenRecordPayload;
      return record;
    } catch (error) {
      const message = (error as Error)?.name || '';
      if (message === 'ParameterNotFound') {
        return null;
      }
      logger.error(`[ParameterStore] Failed to load token ${name}`, error);
      throw error;
    }
  };

  const createToken: MCPTokenMethods['createToken'] = async (tokenData) => {
    if (!tokenData.identifier) {
      throw new Error('ParameterStore token creation requires an identifier');
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + tokenData.expiresIn * 1000);
    const encrypted = extractEncryptedFlag(tokenData.metadata);
    const record = toTokenRecordPayload(tokenData, createdAt, expiresAt, encrypted);
    const name = buildResourceName(prefix, String(tokenData.userId), tokenData.identifier);

    const payload = JSON.stringify(record);
    const tier = payload.length > 4096 ? 'Advanced' : undefined;

    await withRetry(
      () =>
        client.send(
          new PutParameterCommand({
            Name: name,
            Type: ACCESS_TYPE,
            Overwrite: true,
            KeyId: kmsKeyId,
            Value: payload,
            Tier: tier,
          }),
        ),
      retryOptions,
    );

    return toToken(record);
  };

  const updateToken: MCPTokenMethods['updateToken'] = async (query, updateData) => {
    const record = await loadRecord(query);
    if (!record) {
      return null;
    }

    const encrypted = extractEncryptedFlag(
      updateData.metadata ?? objectToMetadataMap(record.metadata),
    );

    const expiresIn =
      'expiresIn' in updateData ? (updateData as { expiresIn?: number }).expiresIn : undefined;
    const expiresAt =
      (updateData.expiresAt as Date | undefined)?.toISOString() ??
      (expiresIn != null
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : record.expiresAt);

    const mergedRecord: TokenRecordPayload = {
      userId: record.userId,
      identifier: updateData.identifier ?? record.identifier,
      type: updateData.type ?? record.type,
      token: updateData.token ?? record.token,
      createdAt: record.createdAt,
      expiresAt,
      metadata: {
        ...(record.metadata ?? {}),
        ...metadataToObject(updateData.metadata),
        encrypted,
      },
      encrypted,
    };

    const name = buildResourceName(
      prefix,
      record.userId,
      mergedRecord.identifier ?? record.identifier!,
    );

    const payload = JSON.stringify(mergedRecord);
    const tier = payload.length > 4096 ? 'Advanced' : undefined;

    await withRetry(
      () =>
        client.send(
          new PutParameterCommand({
            Name: name,
            Type: ACCESS_TYPE,
            Overwrite: true,
            KeyId: kmsKeyId,
            Value: payload,
            Tier: tier,
          }),
        ),
      retryOptions,
    );

    return toToken(mergedRecord);
  };

  const findToken: MCPTokenMethods['findToken'] = async (query) => {
    const record = await loadRecord(query);
    return record ? toToken(record) : null;
  };

  const deleteTokens: MCPTokenMethods['deleteTokens'] = async (query) => {
    if (!query) {
      return { deletedCount: 0 };
    }

    const targets: string[] = [];

    if (query.identifier && query.userId) {
      targets.push(buildResourceName(prefix, String(query.userId), query.identifier));
    } else if (query.userId) {
      const userPath = `${prefix}/${sanitizeSegment(String(query.userId))}`;
      let nextToken: string | undefined = undefined;
      do {
        const response = await withRetry(
          () =>
            client.send(
              new GetParametersByPathCommand({
                Path: userPath,
                Recursive: true,
                WithDecryption: false,
                NextToken: nextToken,
              }),
            ),
          retryOptions,
        );
        (response.Parameters ?? []).forEach((param: Parameter) => {
          if (param.Name) {
            targets.push(param.Name);
          }
        });
        nextToken = response.NextToken;
      } while (nextToken);
    }

    let count = 0;
    for (const name of targets) {
      await withRetry(() => client.send(new DeleteParameterCommand({ Name: name })), retryOptions);
      count++;
    }

    return { deletedCount: count };
  };

  return {
    createToken,
    updateToken,
    findToken,
    deleteTokens,
  } as MCPTokenMethods;
}
