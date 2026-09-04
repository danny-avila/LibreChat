import type { TCodeEnvironmentPairingResponse } from '../types';

export type CodeWorkerShell = 'posix' | 'powershell';
export type CodeWorkerPairing = TCodeEnvironmentPairingResponse['pairing'];

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function createCodeWorkerSetupCommand(
  pairing: CodeWorkerPairing,
  shell: CodeWorkerShell,
): string {
  const quote = shell === 'powershell' ? quotePowerShell : quotePosix;
  const pair = `librechat-code pair ${quote(pairing.endpoint)} ${quote(pairing.code)} --worker-id ${quote(pairing.workerId)}`;
  const run =
    'librechat-code run --default-workspace --allow-workspace-writes --allow-workspace-commands';

  if (shell === 'powershell') {
    return `${pair}\n$env:LIBRECHAT_CODE_WORKER_ID = ${quote(pairing.workerId)}\n${run}`;
  }

  return `${pair}\nLIBRECHAT_CODE_WORKER_ID=${quote(pairing.workerId)} ${run}`;
}
