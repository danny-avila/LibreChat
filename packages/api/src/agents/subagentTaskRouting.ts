import { createHash, randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import type { Cluster, Redis } from 'ioredis';
import type {
  SubagentTaskClaim,
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskSnapshot,
} from '@librechat/agents';

const PROTOCOL_VERSION = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const MAX_PENDING_REQUESTS = 1_000;
const MAX_RESPONSE_CACHE_ENTRIES = 2_000;
const RESPONSE_CACHE_TTL_MS = 5 * 60_000;
const MAX_SCOPE_ID_CHARS = 4_096;
const MAX_TASK_ID_CHARS = 256;
const MAX_CONTROL_MESSAGE_CHARS = 64 * 1_024;

const REGISTER_TASK_SCRIPT =
  "redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); " +
  "redis.call('PEXPIRE', KEYS[1], ARGV[3]); " +
  'return 1';

type RedisClient = Redis | Cluster;
interface RoutedRequestBase {
  version: typeof PROTOCOL_VERSION;
  kind: 'request';
  requestId: string;
  requesterId: string;
  scopeId: string;
}

type RoutedRequest = RoutedRequestBase &
  (
    | { operation: 'claim'; taskId: string }
    | { operation: 'control'; taskId: string; command: SubagentTaskControlCommand }
    | { operation: 'list' }
  );

type RoutedRequestPayload =
  | { operation: 'claim'; scopeId: string; taskId: string }
  | {
      operation: 'control';
      scopeId: string;
      taskId: string;
      command: SubagentTaskControlCommand;
    }
  | { operation: 'list'; scopeId: string };

interface RoutedResponse {
  version: typeof PROTOCOL_VERSION;
  kind: 'response';
  requestId: string;
  ok: boolean;
  result?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  retry: ReturnType<typeof setTimeout>;
  timeout: ReturnType<typeof setTimeout>;
}

interface CachedResponse {
  value: string;
  expiresAt: number;
}

export interface SubagentTaskControlHandler {
  claim(scopeId: string, taskId: string): SubagentTaskClaim;
  control(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
  ): SubagentTaskControlResult;
  list(scopeId: string): SubagentTaskSnapshot[];
}

/** Optional host transport for reaching the process that owns a live child task. */
export interface SubagentTaskControlTransport {
  bind(handler: SubagentTaskControlHandler): Promise<void>;
  registerTask(scopeId: string, taskId: string, ttlMs: number): Promise<void>;
  hasTasks(scopeId: string): Promise<boolean>;
  claim(scopeId: string, taskId: string): Promise<SubagentTaskClaim | undefined>;
  control(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
  ): Promise<SubagentTaskControlResult | undefined>;
  list(scopeId: string): Promise<SubagentTaskSnapshot[]>;
  destroy(): Promise<void>;
}

export class SubagentTaskOwnerUnavailableError extends Error {
  constructor() {
    super('The process running this subagent task is temporarily unavailable.');
  }
}

export interface RedisSubagentTaskControlTransportOptions {
  /** Separates pub/sub channels for deployments sharing one Redis service. */
  namespace?: string;
  instanceId?: string;
  requestTimeoutMs?: number;
  retryDelayMs?: number;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value != null && value > 0 ? value : fallback;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 24);
}

function isBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars;
}

function isStringWithin(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length <= maxChars;
}

async function waitForRedisReady(client: RedisClient): Promise<void> {
  if (client.status == null || client.status === 'ready') {
    return;
  }
  if (client.status === 'end') {
    throw new SubagentTaskOwnerUnavailableError();
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      client.off('ready', onReady);
      client.off('end', onEnd);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new SubagentTaskOwnerUnavailableError());
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new SubagentTaskOwnerUnavailableError());
    }, DEFAULT_READY_TIMEOUT_MS);
    timeout.unref?.();
    client.once('ready', onReady);
    client.once('end', onEnd);
  });
}

function isSnapshot(value: unknown): value is SubagentTaskSnapshot {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<SubagentTaskSnapshot>;
  return (
    isBoundedString(candidate.taskId, MAX_TASK_ID_CHARS) &&
    typeof candidate.subagentType === 'string' &&
    ['running', 'completed', 'error', 'cancelled'].includes(candidate.status ?? '') &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.resultAvailable === 'boolean' &&
    typeof candidate.resultClaimed === 'boolean' &&
    typeof candidate.pendingControls === 'number'
  );
}

function isClaim(value: unknown): value is SubagentTaskClaim {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<SubagentTaskClaim>;
  if (candidate.status === 'not_found') {
    return true;
  }
  if (!('task' in candidate) || !isSnapshot(candidate.task)) {
    return false;
  }
  if (candidate.status === 'completed') {
    return 'result' in candidate && typeof candidate.result === 'string';
  }
  if (candidate.status === 'error' || candidate.status === 'cancelled') {
    return 'error' in candidate && typeof candidate.error === 'string';
  }
  return candidate.status === 'running' || candidate.status === 'claimed';
}

function isControlResult(value: unknown): value is SubagentTaskControlResult {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<SubagentTaskControlResult>;
  if (candidate.status === 'not_found') {
    return true;
  }
  if (candidate.status === 'invalid') {
    return typeof candidate.message === 'string';
  }
  return (
    ['accepted', 'cancelled', 'not_running', 'control_not_found'].includes(
      candidate.status ?? '',
    ) &&
    'task' in candidate &&
    isSnapshot(candidate.task)
  );
}

function parseControlCommand(value: unknown): SubagentTaskControlCommand | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as { action?: unknown; message?: unknown; controlId?: unknown };
  if (candidate.action === 'cancel') {
    return { action: 'cancel' };
  }
  if (candidate.action === 'cancel_message') {
    return isStringWithin(candidate.controlId, MAX_TASK_ID_CHARS)
      ? { action: 'cancel_message', controlId: candidate.controlId }
      : undefined;
  }
  if (
    (candidate.action === 'steer' ||
      candidate.action === 'queue' ||
      candidate.action === 'interrupt') &&
    isStringWithin(candidate.message, MAX_CONTROL_MESSAGE_CHARS)
  ) {
    return { action: candidate.action, message: candidate.message };
  }
  return undefined;
}

function parseRequest(value: unknown): RoutedRequest | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as {
    version?: unknown;
    kind?: unknown;
    requestId?: unknown;
    requesterId?: unknown;
    operation?: unknown;
    scopeId?: unknown;
    taskId?: unknown;
    command?: unknown;
  };
  if (
    candidate.version !== PROTOCOL_VERSION ||
    candidate.kind !== 'request' ||
    !isBoundedString(candidate.requestId, 128) ||
    !isBoundedString(candidate.requesterId, 128) ||
    !['claim', 'control', 'list'].includes(
      typeof candidate.operation === 'string' ? candidate.operation : '',
    ) ||
    !isBoundedString(candidate.scopeId, MAX_SCOPE_ID_CHARS)
  ) {
    return undefined;
  }
  if (candidate.operation === 'list') {
    return {
      version: PROTOCOL_VERSION,
      kind: 'request',
      requestId: candidate.requestId,
      requesterId: candidate.requesterId,
      operation: 'list',
      scopeId: candidate.scopeId,
    };
  }
  if (!isBoundedString(candidate.taskId, MAX_TASK_ID_CHARS)) {
    return undefined;
  }
  if (candidate.operation === 'claim') {
    return {
      version: PROTOCOL_VERSION,
      kind: 'request',
      requestId: candidate.requestId,
      requesterId: candidate.requesterId,
      operation: 'claim',
      scopeId: candidate.scopeId,
      taskId: candidate.taskId,
    };
  }
  const command = parseControlCommand(candidate.command);
  if (command == null) {
    return undefined;
  }
  return {
    version: PROTOCOL_VERSION,
    kind: 'request',
    requestId: candidate.requestId,
    requesterId: candidate.requesterId,
    operation: 'control',
    scopeId: candidate.scopeId,
    taskId: candidate.taskId,
    command,
  };
}

function parseResponse(value: unknown): RoutedResponse | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Partial<RoutedResponse>;
  if (
    candidate.version !== PROTOCOL_VERSION ||
    candidate.kind !== 'response' ||
    !isBoundedString(candidate.requestId, 128) ||
    typeof candidate.ok !== 'boolean'
  ) {
    return undefined;
  }
  return candidate as RoutedResponse;
}

/**
 * Routes bounded live-task operations to their owning API replica. Redis keeps
 * only an expiring owner directory and request/reply envelopes; the executor,
 * transcript, and checkpoint never move between processes.
 */
export class RedisSubagentTaskControlTransport implements SubagentTaskControlTransport {
  private readonly instanceId: string;
  private readonly namespaceHash: string;
  private readonly requestTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly responseCache = new Map<string, CachedResponse>();
  private handler?: SubagentTaskControlHandler;
  private ready?: Promise<void>;
  private destroyed = false;

  constructor(
    private readonly publisher: RedisClient,
    private readonly subscriber: RedisClient,
    options: RedisSubagentTaskControlTransportOptions = {},
  ) {
    this.instanceId = options.instanceId?.trim() || randomUUID();
    this.namespaceHash = shortHash(options.namespace?.trim() || 'default');
    this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.retryDelayMs = Math.min(
      positiveInteger(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS),
      Math.max(1, Math.floor(this.requestTimeoutMs / 2)),
    );
  }

  async bind(handler: SubagentTaskControlHandler): Promise<void> {
    if (this.destroyed) {
      throw new Error('Subagent task control transport is closed.');
    }
    if (this.handler != null) {
      throw new Error('Subagent task control transport is already bound.');
    }
    this.handler = handler;
    await waitForRedisReady(this.subscriber);
    this.subscriber.on('message', this.onMessage);
    this.ready = this.subscriber.subscribe(this.channel(this.instanceId)).then(() => undefined);
    await this.ready;
  }

  async registerTask(scopeId: string, taskId: string, ttlMs: number): Promise<void> {
    this.assertTaskAddress(scopeId, taskId);
    await this.requireReady();
    await this.publisher.eval(
      REGISTER_TASK_SCRIPT,
      1,
      this.registryKey(scopeId),
      taskId,
      this.instanceId,
      positiveInteger(ttlMs, 1).toString(),
    );
  }

  async hasTasks(scopeId: string): Promise<boolean> {
    this.assertScope(scopeId);
    await this.requireReady();
    try {
      return (await this.publisher.hlen(this.registryKey(scopeId))) > 0;
    } catch (error) {
      logger.warn('[subagentTaskRouting] Failed to inspect the task owner directory', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
  }

  async claim(scopeId: string, taskId: string): Promise<SubagentTaskClaim | undefined> {
    const result = await this.requestTaskOwner(scopeId, taskId, 'claim');
    if (result == null) {
      return undefined;
    }
    if (!isClaim(result)) {
      throw new SubagentTaskOwnerUnavailableError();
    }
    if (result.status === 'not_found') {
      await this.removeRegistrations(scopeId, [taskId]);
      return undefined;
    }
    return result;
  }

  async control(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
  ): Promise<SubagentTaskControlResult | undefined> {
    const result = await this.requestTaskOwner(scopeId, taskId, 'control', command);
    if (result == null) {
      return undefined;
    }
    if (!isControlResult(result)) {
      throw new SubagentTaskOwnerUnavailableError();
    }
    if (result.status === 'not_found') {
      await this.removeRegistrations(scopeId, [taskId]);
      return undefined;
    }
    return result;
  }

  async list(scopeId: string): Promise<SubagentTaskSnapshot[]> {
    this.assertScope(scopeId);
    await this.requireReady();
    let ownersByTask: Record<string, string>;
    try {
      ownersByTask = await this.publisher.hgetall(this.registryKey(scopeId));
    } catch (error) {
      logger.warn('[subagentTaskRouting] Failed to read the task owner directory', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
    const owners = new Set(Object.values(ownersByTask));
    owners.delete(this.instanceId);
    if (owners.size === 0) {
      return [];
    }
    const ownerIds = [...owners];
    const results = await Promise.all(
      ownerIds.map((ownerId) => this.sendRequest(ownerId, { operation: 'list', scopeId })),
    );
    const snapshots: SubagentTaskSnapshot[] = [];
    const staleTaskIds: string[] = [];
    for (const [index, value] of results.entries()) {
      if (!Array.isArray(value) || !value.every(isSnapshot)) {
        throw new SubagentTaskOwnerUnavailableError();
      }
      const ownerId = ownerIds[index];
      const reportedTaskIds = new Set(value.map((snapshot) => snapshot.taskId));
      for (const snapshot of value) {
        if (ownersByTask[snapshot.taskId] === ownerId) {
          snapshots.push(snapshot);
        }
      }
      for (const [taskId, registeredOwnerId] of Object.entries(ownersByTask)) {
        if (registeredOwnerId === ownerId && !reportedTaskIds.has(taskId)) {
          staleTaskIds.push(taskId);
        }
      }
    }
    if (staleTaskIds.length > 0) {
      await this.removeRegistrations(scopeId, staleTaskIds);
    }
    return snapshots;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.retry);
      clearTimeout(pending.timeout);
      pending.reject(new SubagentTaskOwnerUnavailableError());
    }
    this.pending.clear();
    this.responseCache.clear();
    this.subscriber.off('message', this.onMessage);
    await this.subscriber.unsubscribe(this.channel(this.instanceId)).catch(() => undefined);
    this.subscriber.disconnect();
  }

  private readonly onMessage = (channel: string, message: string): void => {
    if (channel !== this.channel(this.instanceId) || message.length > 256 * 1_024) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(message) as unknown;
    } catch {
      return;
    }
    const response = parseResponse(parsed);
    if (response != null) {
      this.handleResponse(response);
      return;
    }
    const request = parseRequest(parsed);
    if (request != null) {
      void this.handleRequest(request).catch((error) => {
        logger.warn('[subagentTaskRouting] Failed to answer a routed command', error);
      });
    }
  };

  private handleResponse(response: RoutedResponse): void {
    const pending = this.pending.get(response.requestId);
    if (pending == null) {
      return;
    }
    this.pending.delete(response.requestId);
    clearTimeout(pending.retry);
    clearTimeout(pending.timeout);
    if (!response.ok) {
      pending.reject(new SubagentTaskOwnerUnavailableError());
      return;
    }
    pending.resolve(response.result);
  }

  private async handleRequest(request: RoutedRequest): Promise<void> {
    const cached = this.responseCache.get(request.requestId);
    if (cached != null && cached.expiresAt > Date.now()) {
      await this.publish(this.channel(request.requesterId), cached.value);
      return;
    }
    const handler = this.handler;
    if (handler == null) {
      return;
    }
    let response: RoutedResponse;
    try {
      let result: SubagentTaskClaim | SubagentTaskControlResult | SubagentTaskSnapshot[];
      if (request.operation === 'list') {
        result = handler.list(request.scopeId);
      } else if (request.operation === 'claim') {
        result = handler.claim(request.scopeId, request.taskId);
      } else {
        result = handler.control(request.scopeId, request.taskId, request.command);
      }
      response = {
        version: PROTOCOL_VERSION,
        kind: 'response',
        requestId: request.requestId,
        ok: true,
        result,
      };
    } catch (error) {
      logger.error('[subagentTaskRouting] Owner failed to process a routed command', error);
      response = {
        version: PROTOCOL_VERSION,
        kind: 'response',
        requestId: request.requestId,
        ok: false,
      };
    }
    const serialized = JSON.stringify(response);
    this.cacheResponse(request.requestId, serialized);
    await this.publish(this.channel(request.requesterId), serialized);
  }

  private async requestTaskOwner(
    scopeId: string,
    taskId: string,
    operation: 'claim' | 'control',
    command?: SubagentTaskControlCommand,
  ): Promise<unknown | undefined> {
    this.assertTaskAddress(scopeId, taskId);
    await this.requireReady();
    let ownerId: string | null;
    try {
      ownerId = await this.publisher.hget(this.registryKey(scopeId), taskId);
    } catch (error) {
      logger.warn('[subagentTaskRouting] Failed to resolve the task owner', error);
      throw new SubagentTaskOwnerUnavailableError();
    }
    if (!isBoundedString(ownerId, 128)) {
      return undefined;
    }
    if (operation === 'claim') {
      return this.sendRequest(ownerId, { operation, scopeId, taskId });
    }
    if (command == null) {
      throw new Error('A routed subagent control command is required.');
    }
    return this.sendRequest(ownerId, { operation, scopeId, taskId, command });
  }

  private async sendRequest(ownerId: string, request: RoutedRequestPayload): Promise<unknown> {
    await this.requireReady();
    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      throw new SubagentTaskOwnerUnavailableError();
    }
    const requestId = randomUUID();
    const envelope: RoutedRequest = {
      version: PROTOCOL_VERSION,
      kind: 'request',
      requestId,
      requesterId: this.instanceId,
      ...request,
    };
    const serialized = JSON.stringify(envelope);
    const destination = this.channel(ownerId);
    return new Promise<unknown>((resolve, reject) => {
      const retry = setTimeout(() => {
        void this.publish(destination, serialized).catch((error) => {
          logger.warn('[subagentTaskRouting] Routed command retry failed', error);
        });
      }, this.retryDelayMs);
      retry.unref?.();
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        clearTimeout(retry);
        reject(new SubagentTaskOwnerUnavailableError());
      }, this.requestTimeoutMs);
      timeout.unref?.();
      this.pending.set(requestId, { resolve, reject, retry, timeout });
      void this.publish(destination, serialized).catch((error) => {
        logger.warn('[subagentTaskRouting] Routed command publish failed', error);
      });
    });
  }

  private cacheResponse(requestId: string, value: string): void {
    const now = Date.now();
    for (const [id, cached] of this.responseCache) {
      if (cached.expiresAt <= now) {
        this.responseCache.delete(id);
      }
    }
    while (this.responseCache.size >= MAX_RESPONSE_CACHE_ENTRIES) {
      const oldest = this.responseCache.keys().next().value as string | undefined;
      if (oldest == null) {
        break;
      }
      this.responseCache.delete(oldest);
    }
    this.responseCache.set(requestId, {
      value,
      expiresAt: now + RESPONSE_CACHE_TTL_MS,
    });
  }

  private async publish(channel: string, value: string): Promise<void> {
    await this.publisher.publish(channel, value);
  }

  private async removeRegistrations(scopeId: string, taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) {
      return;
    }
    await this.publisher.hdel(this.registryKey(scopeId), ...taskIds).catch((error) => {
      logger.warn('[subagentTaskRouting] Failed to prune stale task owners', error);
    });
  }

  private registryKey(scopeId: string): string {
    return `subagent-task:{${shortHash(scopeId)}}:owners`;
  }

  private channel(instanceId: string): string {
    return `subagent-task-control:${this.namespaceHash}:${instanceId}`;
  }

  private assertScope(scopeId: string): void {
    if (!isBoundedString(scopeId, MAX_SCOPE_ID_CHARS)) {
      throw new Error('Invalid subagent task routing scope.');
    }
  }

  private assertTaskAddress(scopeId: string, taskId: string): void {
    this.assertScope(scopeId);
    if (!isBoundedString(taskId, MAX_TASK_ID_CHARS)) {
      throw new Error('Invalid subagent task routing identity.');
    }
  }

  private async requireReady(): Promise<void> {
    if (this.destroyed || this.ready == null) {
      throw new SubagentTaskOwnerUnavailableError();
    }
    await this.ready;
  }
}
