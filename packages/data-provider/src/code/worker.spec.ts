import { createCodeWorkerSetupCommand } from './worker';

const pairing = {
  endpoint: 'https://code.example.com/v1',
  code: "one-time'code",
  workerId: "worker'one",
};

describe('createCodeWorkerSetupCommand', () => {
  it('creates a POSIX and WSL2 command for the native default workspace', () => {
    expect(createCodeWorkerSetupCommand(pairing, 'posix')).toBe(
      "librechat-code pair 'https://code.example.com/v1' 'one-time'\\''code' --worker-id 'worker'\\''one'\n" +
        "LIBRECHAT_CODE_WORKER_ID='worker'\\''one' librechat-code run --default-workspace --allow-workspace-writes --allow-workspace-commands",
    );
  });

  it('creates a PowerShell command without POSIX quoting', () => {
    expect(createCodeWorkerSetupCommand(pairing, 'powershell')).toBe(
      "librechat-code pair 'https://code.example.com/v1' 'one-time''code' --worker-id 'worker''one'\n" +
        "$env:LIBRECHAT_CODE_WORKER_ID = 'worker''one'\n" +
        'librechat-code run --default-workspace --allow-workspace-writes --allow-workspace-commands',
    );
  });
});
