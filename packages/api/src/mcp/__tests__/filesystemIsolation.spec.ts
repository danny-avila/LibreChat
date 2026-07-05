import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { IUser } from '@librechat/data-schemas';
import type { MCPOptions } from 'librechat-data-provider';
import { processMCPEnv } from '~/utils/env';

/**
 * Security regression guard for the built-in `filesystem` MCP server.
 *
 * The server MUST stay isolated per user: LibreChat spawns a single SHARED
 * (app-level) subprocess for any stdio server that is eligible for the app-level
 * pool, which would hand every user the same filesystem root. Two config settings
 * prevent that, and this test pins both against the real deployed `librechat.yaml`:
 *   1. `startup: false` — excludes it from the shared app-level pool, forcing a
 *      per-user connection (see ConnectionsRepository.isAllowedToConnectToServer).
 *   2. a `{{LIBRECHAT_USER_ID}}` segment in the root path — resolved per user by
 *      processMCPEnv at connection time so each user is jailed to their own dir.
 */
describe('filesystem MCP server — per-user isolation (librechat.yaml)', () => {
  const findRepoRoot = (): string => {
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'librechat.yaml'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
    throw new Error('Could not locate librechat.yaml above ' + __dirname);
  };

  const loadFilesystemConfig = (): MCPOptions & { startup?: boolean } => {
    const configPath = path.join(findRepoRoot(), 'librechat.yaml');
    const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as {
      mcpServers?: Record<string, MCPOptions & { startup?: boolean }>;
    };
    const server = config.mcpServers?.filesystem;
    if (!server) {
      throw new Error('filesystem server not found in librechat.yaml mcpServers');
    }
    return server;
  };

  const userA = { id: '64b7f0aaaaaaaaaaaaaaaaaa' } as Partial<IUser>;
  const userB = { id: '64b7f0bbbbbbbbbbbbbbbbbb' } as Partial<IUser>;

  const resolvedArgs = (user: Partial<IUser>): string[] => {
    const config = loadFilesystemConfig();
    const processed = processMCPEnv({ options: config, user });
    return 'args' in processed && processed.args ? processed.args : [];
  };

  it('is excluded from the shared app-level pool (startup: false)', () => {
    expect(loadFilesystemConfig().startup).toBe(false);
  });

  it('roots the server at a per-user path placeholder', () => {
    const config = loadFilesystemConfig();
    const args = 'args' in config && config.args ? config.args : [];
    expect(args.some((a) => a.includes('{{LIBRECHAT_USER_ID}}'))).toBe(true);
  });

  it('jails each user to their own resolved directory', () => {
    const cmdA = resolvedArgs(userA).join(' ');
    const cmdB = resolvedArgs(userB).join(' ');

    expect(cmdA).toContain(`/app/uploads/${userA.id}`);
    expect(cmdB).toContain(`/app/uploads/${userB.id}`);
  });

  it("does not leak one user's directory into another user's command", () => {
    const cmdA = resolvedArgs(userA).join(' ');
    const cmdB = resolvedArgs(userB).join(' ');

    expect(cmdA).not.toContain(userB.id as string);
    expect(cmdB).not.toContain(userA.id as string);
  });

  it('fully resolves the placeholder (no literal leak into a real path)', () => {
    const cmdA = resolvedArgs(userA).join(' ');
    expect(cmdA).not.toContain('{{LIBRECHAT_USER_ID}}');
  });
});
