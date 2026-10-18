import { SystemCapabilities } from 'librechat-data-provider';

/**
 * Tests for the production capability guard functions.
 *
 * We mock `createServerFn` to pass handlers through as-is and `apiFetch` to
 * return controlled capability sets. This means `getEffectiveCapabilitiesFn`
 * is the real handler that calls the mocked `apiFetch`, and the guard functions
 * (`requireCapability`, etc.) call the real `getEffectiveCapabilitiesFn` via
 * their internal module binding — exercising the full production code path.
 */

let mockHeldCaps: string[] = [];

jest.mock('./utils/api', () => ({
  apiFetch: jest.fn(async () => ({
    ok: true,
    json: async () => ({ capabilities: mockHeldCaps }),
  })),
  extractApiError: jest.fn(async (_res: unknown, msg: string) => {
    throw new Error(msg);
  }),
}));

jest.mock('~/admin/query', () => ({
  queryOptions: (opts: unknown) => opts,
}));

import {
  requireCapability,
  requireAnyCapability,
  requireAllSectionCapabilities,
} from './capabilities';

function setCaps(caps: string[]) {
  mockHeldCaps = caps;
}

describe('server capability guards', () => {
  beforeEach(() => {
    mockHeldCaps = [];
  });

  describe('requireCapability', () => {
    it('resolves when capability is directly held', async () => {
      setCaps([SystemCapabilities.MANAGE_CONFIGS]);
      await expect(requireCapability(SystemCapabilities.MANAGE_CONFIGS)).resolves.toBeUndefined();
    });

    it('resolves when capability is implied (MANAGE_CONFIGS → READ_CONFIGS)', async () => {
      setCaps([SystemCapabilities.MANAGE_CONFIGS]);
      await expect(requireCapability(SystemCapabilities.READ_CONFIGS)).resolves.toBeUndefined();
    });

    it('throws when capability is not held or implied', async () => {
      setCaps([SystemCapabilities.READ_CONFIGS]);
      await expect(requireCapability(SystemCapabilities.MANAGE_CONFIGS)).rejects.toThrow(
        'Insufficient permissions: requires manage:configs',
      );
    });

    it('throws for empty capabilities list', async () => {
      setCaps([]);
      await expect(requireCapability(SystemCapabilities.ACCESS_ADMIN)).rejects.toThrow(
        'Insufficient permissions',
      );
    });
  });

  describe('requireAnyCapability', () => {
    it('resolves when first capability matches', async () => {
      setCaps([SystemCapabilities.ASSIGN_CONFIGS]);
      await expect(
        requireAnyCapability([
          SystemCapabilities.ASSIGN_CONFIGS,
          SystemCapabilities.MANAGE_CONFIGS,
        ]),
      ).resolves.toBeUndefined();
    });

    it('resolves when second capability matches', async () => {
      setCaps([SystemCapabilities.MANAGE_CONFIGS]);
      await expect(
        requireAnyCapability([
          SystemCapabilities.ASSIGN_CONFIGS,
          SystemCapabilities.MANAGE_CONFIGS,
        ]),
      ).resolves.toBeUndefined();
    });

    it('throws when no capability matches', async () => {
      setCaps([SystemCapabilities.READ_CONFIGS]);
      await expect(
        requireAnyCapability([
          SystemCapabilities.ASSIGN_CONFIGS,
          SystemCapabilities.MANAGE_CONFIGS,
        ]),
      ).rejects.toThrow('Insufficient permissions: requires one of');
    });

    it('throws on empty required array', async () => {
      setCaps([SystemCapabilities.MANAGE_CONFIGS]);
      await expect(requireAnyCapability([])).rejects.toThrow('No capabilities provided');
    });
  });

  describe('requireAllSectionCapabilities', () => {
    it('resolves immediately when broad MANAGE_CONFIGS is held', async () => {
      setCaps([SystemCapabilities.MANAGE_CONFIGS]);
      await expect(
        requireAllSectionCapabilities(['mcp', 'endpoints', 'auth']),
      ).resolves.toBeUndefined();
    });

    it('resolves when all sections have their manage:configs:{section} capability', async () => {
      setCaps(['manage:configs:mcp', 'manage:configs:endpoints']);
      await expect(requireAllSectionCapabilities(['mcp', 'endpoints'])).resolves.toBeUndefined();
    });

    it('throws for the first section missing its capability', async () => {
      setCaps(['manage:configs:mcp']);
      await expect(requireAllSectionCapabilities(['mcp', 'auth'])).rejects.toThrow(
        'Insufficient permissions: requires manage:configs:auth',
      );
    });

    it('throws with correct section name in the message', async () => {
      setCaps([]);
      await expect(requireAllSectionCapabilities(['endpoints'])).rejects.toThrow(
        'manage:configs:endpoints',
      );
    });

    it('throws on empty sections array', async () => {
      setCaps([SystemCapabilities.READ_CONFIGS]);
      await expect(requireAllSectionCapabilities([])).rejects.toThrow('No sections provided');
    });

    it('rejects mixed-section batch when user has only single section capability', async () => {
      setCaps(['manage:configs:mcp']);
      await expect(requireAllSectionCapabilities(['mcp', 'auth', 'balance'])).rejects.toThrow(
        'manage:configs:auth',
      );
    });
  });
});
