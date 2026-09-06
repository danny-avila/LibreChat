const CODE_BRIDGE_REQUEST_TIMEOUT_MS = 10_000;

export type CodeBridgePrincipalType = 'deployment' | 'tenant' | 'user' | 'role' | 'group';

export type CodeBridgeWorkerBinding = {
  tenantId: string;
  principal: {
    type: CodeBridgePrincipalType;
    id: string;
  };
};

export type CodeBridgePairing = {
  protocolVersion: 1;
  workerId: string;
  code: string;
  expiresAt: string;
};

export type CodeBridgeWorkerStatus = {
  status: 'offline' | 'starting' | 'ready';
  leaseExpiresInMs?: number;
  sandboxProfile?: string;
  runtimes?: string[];
  operations?: string[];
};

export type CodeBridgeFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export class CodeBridgePairingError extends Error {
  constructor(
    public readonly reason: 'rejected' | 'invalid' | 'timeout' | 'failed',
    public readonly upstreamStatus?: number,
  ) {
    super(`Code bridge pairing ${reason}`);
    this.name = 'CodeBridgePairingError';
  }
}

export class CodeBridgeLifecycleError extends Error {
  constructor(
    public readonly reason: 'rejected' | 'invalid' | 'timeout' | 'failed',
    public readonly upstreamStatus?: number,
  ) {
    super(`Code bridge lifecycle request ${reason}`);
    this.name = 'CodeBridgeLifecycleError';
  }
}

export class CodeBridgeStatusError extends Error {
  constructor(
    public readonly reason: 'rejected' | 'invalid' | 'timeout' | 'failed',
    public readonly upstreamStatus?: number,
  ) {
    super(`Code bridge status request ${reason}`);
    this.name = 'CodeBridgeStatusError';
  }
}

function validStatusString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function validStatusStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.length <= 32 && value.every((item) => validStatusString(item))
  );
}

export async function getCodeBridgeWorkerStatus({
  baseURL,
  token,
  workerId,
  fetchImpl = fetch,
}: {
  baseURL: string;
  token: string;
  workerId: string;
  fetchImpl?: CodeBridgeFetch;
}): Promise<CodeBridgeWorkerStatus> {
  try {
    const response = await fetchImpl(
      `${baseURL.trim().replace(/\/+$/, '')}/bridge/workers/${encodeURIComponent(workerId)}/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(CODE_BRIDGE_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new CodeBridgeStatusError('rejected', response.status);
    }
    const payload = (await response.json()) as unknown;
    if (typeof payload !== 'object' || payload == null) {
      throw new CodeBridgeStatusError('invalid');
    }
    const status = payload as {
      protocolVersion?: unknown;
      workerId?: unknown;
      online?: unknown;
      ready?: unknown;
      leaseExpiresInMs?: unknown;
      capabilities?: {
        sandboxProfile?: unknown;
        runtimes?: unknown;
        workspaceTools?: { operations?: unknown };
      };
    };
    const capabilities = status.capabilities;
    const validLease =
      status.leaseExpiresInMs == null ||
      (typeof status.leaseExpiresInMs === 'number' &&
        Number.isSafeInteger(status.leaseExpiresInMs) &&
        status.leaseExpiresInMs > 0 &&
        status.leaseExpiresInMs <= 60_000);
    const validCapabilities =
      capabilities == null || validStatusString(capabilities.sandboxProfile);
    const validRuntimes = capabilities == null || validStatusStringArray(capabilities.runtimes);
    const validOperations =
      capabilities?.workspaceTools?.operations == null ||
      validStatusStringArray(capabilities.workspaceTools.operations);
    if (
      status.protocolVersion !== 1 ||
      status.workerId !== workerId ||
      typeof status.online !== 'boolean' ||
      typeof status.ready !== 'boolean' ||
      (status.ready && !status.online) ||
      (status.online && (status.leaseExpiresInMs == null || capabilities == null)) ||
      (!status.online && (status.leaseExpiresInMs != null || capabilities != null)) ||
      !validLease ||
      !validCapabilities ||
      !validRuntimes ||
      !validOperations
    ) {
      throw new CodeBridgeStatusError('invalid');
    }
    let workerStatus: CodeBridgeWorkerStatus['status'] = 'offline';
    if (status.online) {
      workerStatus = status.ready ? 'ready' : 'starting';
    }
    return {
      status: workerStatus,
      ...(typeof status.leaseExpiresInMs !== 'number'
        ? {}
        : { leaseExpiresInMs: status.leaseExpiresInMs }),
      ...(typeof capabilities?.sandboxProfile !== 'string'
        ? {}
        : { sandboxProfile: capabilities.sandboxProfile }),
      ...(validStatusStringArray(capabilities?.runtimes)
        ? { runtimes: capabilities.runtimes }
        : {}),
      ...(validStatusStringArray(capabilities?.workspaceTools?.operations)
        ? { operations: capabilities.workspaceTools.operations }
        : {}),
    };
  } catch (error) {
    if (error instanceof CodeBridgeStatusError) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new CodeBridgeStatusError('timeout');
    }
    throw new CodeBridgeStatusError('failed');
  }
}

function validPairing(value: unknown, workerId: string): value is CodeBridgePairing {
  if (typeof value !== 'object' || value == null) return false;
  const pairing = value as Partial<CodeBridgePairing>;
  const expiresAt = typeof pairing.expiresAt === 'string' ? Date.parse(pairing.expiresAt) : NaN;
  return (
    pairing.protocolVersion === 1 &&
    pairing.workerId === workerId &&
    typeof pairing.code === 'string' &&
    /^[A-Za-z0-9_-]{32}$/.test(pairing.code) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );
}

export async function createCodeBridgePairing({
  baseURL,
  token,
  workerId,
  binding,
  fetchImpl = fetch,
}: {
  baseURL: string;
  token: string;
  workerId: string;
  binding?: CodeBridgeWorkerBinding;
  fetchImpl?: CodeBridgeFetch;
}): Promise<CodeBridgePairing> {
  try {
    const response = await fetchImpl(`${baseURL.trim().replace(/\/+$/, '')}/bridge/pairings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workerId, ...(binding != null ? { binding } : {}) }),
      redirect: 'error',
      signal: AbortSignal.timeout(CODE_BRIDGE_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new CodeBridgePairingError('rejected', response.status);
    }
    const payload = (await response.json()) as unknown;
    if (!validPairing(payload, workerId)) {
      throw new CodeBridgePairingError('invalid');
    }
    return payload;
  } catch (error) {
    if (error instanceof CodeBridgePairingError) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new CodeBridgePairingError('timeout');
    }
    throw new CodeBridgePairingError('failed');
  }
}

export async function revokeCodeBridgeWorker({
  baseURL,
  token,
  workerId,
  fetchImpl = fetch,
}: {
  baseURL: string;
  token: string;
  workerId: string;
  fetchImpl?: CodeBridgeFetch;
}): Promise<void> {
  try {
    const response = await fetchImpl(
      `${baseURL.trim().replace(/\/+$/, '')}/bridge/workers/${encodeURIComponent(workerId)}/revoke`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(CODE_BRIDGE_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new CodeBridgeLifecycleError('rejected', response.status);
    }
    const payload = (await response.json()) as unknown;
    if (
      typeof payload !== 'object' ||
      payload == null ||
      (payload as { protocolVersion?: unknown }).protocolVersion !== 1 ||
      (payload as { revoked?: unknown }).revoked !== true
    ) {
      throw new CodeBridgeLifecycleError('invalid');
    }
  } catch (error) {
    if (error instanceof CodeBridgeLifecycleError) throw error;
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new CodeBridgeLifecycleError('timeout');
    }
    throw new CodeBridgeLifecycleError('failed');
  }
}

export function readCodeBridgeSecret(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : undefined;
}
