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

export function readCodeBridgeSecret(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : undefined;
}
