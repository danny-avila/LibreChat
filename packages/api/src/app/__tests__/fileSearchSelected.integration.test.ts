import { loadDefaultInterface } from '@librechat/data-schemas';
import { updateInterfacePermissions } from '../permissions';
import type { TCustomConfig, TConfigDefaults } from 'librechat-data-provider';
import type { AppConfig } from '~/types/config';
import { SystemRoles, Permissions, PermissionTypes } from 'librechat-data-provider';

// Mock the logger and memory modules
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@librechat/data-schemas/dist/app/memory', () => ({
  isMemoryEnabled: jest.fn(() => false),
}));

describe('fileSearchSelected Integration Tests', () => {
  const mockGetRoleByName = jest.fn();
  const mockUpdateAccessPermissions = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRoleByName.mockResolvedValue(null);
  });

  describe('End-to-end configuration flow', () => {
    it('should handle complete flow when fileSearchSelected is true and fileSearch is true', async () => {
      // Step 1: Configuration loading
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
          prompts: true,
          bookmarks: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
          prompts: false,
          bookmarks: false,
        },
      };

      // Step 2: Load interface configuration
      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      // Verify interface config is correct
      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(true);
      expect(interfaceConfig.prompts).toBe(true);
      expect(interfaceConfig.bookmarks).toBe(true);

      // Step 3: Create app config and update permissions
      const appConfig: AppConfig = {
        config,
        interfaceConfig,
      } as AppConfig;

      await updateInterfacePermissions({
        appConfig,
        getRoleByName: mockGetRoleByName,
        updateAccessPermissions: mockUpdateAccessPermissions,
      });

      // Step 4: Verify permissions were updated correctly
      expect(mockUpdateAccessPermissions).toHaveBeenCalledTimes(2);

      // Check USER role permissions
      const userCall = mockUpdateAccessPermissions.mock.calls.find(
        (call) => call[0] === SystemRoles.USER,
      );
      expect(userCall[1][PermissionTypes.FILE_SEARCH]).toEqual({
        [Permissions.USE]: true,
      });

      // Check ADMIN role permissions
      const adminCall = mockUpdateAccessPermissions.mock.calls.find(
        (call) => call[0] === SystemRoles.ADMIN,
      );
      expect(adminCall[1][PermissionTypes.FILE_SEARCH]).toEqual({
        [Permissions.USE]: true,
      });
    });

    it('should prevent configuration when fileSearch is false but fileSearchSelected is true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      // Should throw during interface loading
      await expect(loadDefaultInterface({ config, configDefaults })).rejects.toThrow(
        'Configuration error: fileSearchSelected cannot be enabled when fileSearch is disabled',
      );

      // Permissions should not be updated due to the error
      expect(mockUpdateAccessPermissions).not.toHaveBeenCalled();
    });

    it('should handle complex configuration with modelSpecs and fileSearchSelected', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
        modelSpecs: {
          list: [
            {
              name: 'test-model',
              preset: {
                endpoint: 'openAI',
                model: 'gpt-4',
              },
            },
          ],
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
          endpointsMenu: true,
          modelSelect: true,
          parameters: true,
          presets: true,
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      // ModelSpecs should affect other interface elements
      expect(interfaceConfig.endpointsMenu).toBe(false);
      expect(interfaceConfig.parameters).toBe(false);
      expect(interfaceConfig.presets).toBe(false);

      // But fileSearchSelected should preserve explicit configuration
      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(true);
    });

    it('should handle memory configuration alongside fileSearchSelected', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
          memories: true,
        },
        memory: {
          agent: {
            id: 'test-agent',
          },
          personalize: true,
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: false,
          memories: false,
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });
      const appConfig: AppConfig = {
        config,
        interfaceConfig,
      } as AppConfig;

      await updateInterfacePermissions({
        appConfig,
        getRoleByName: mockGetRoleByName,
        updateAccessPermissions: mockUpdateAccessPermissions,
      });

      expect(mockUpdateAccessPermissions).toHaveBeenCalledTimes(2);

      const userCall = mockUpdateAccessPermissions.mock.calls.find(
        (call) => call[0] === SystemRoles.USER,
      );

      // Should have both file search and memory permissions
      expect(userCall[1][PermissionTypes.FILE_SEARCH]).toEqual({
        [Permissions.USE]: true,
      });
      expect(userCall[1][PermissionTypes.MEMORIES]).toBeDefined();
    });

    it('should handle edge case with defaults providing conflicting configuration', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: false, // Explicitly disabled
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true, // Default tries to enable, but fileSearch is false
        },
      };

      // Should throw because defaults create invalid configuration
      await expect(loadDefaultInterface({ config, configDefaults })).rejects.toThrow(
        'Configuration error: fileSearchSelected cannot be enabled when fileSearch is disabled',
      );
    });

    it('should allow fileSearchSelected from defaults when fileSearch is true', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true, // Explicitly enabled
          // fileSearchSelected not specified, should use default
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true, // This should be used since fileSearch is true
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(true);
    });

    it('should handle minimal configuration', async () => {
      const config: Partial<TCustomConfig> = {};
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false,
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });
      const appConfig: AppConfig = {
        config,
        interfaceConfig,
      } as AppConfig;

      await updateInterfacePermissions({
        appConfig,
        getRoleByName: mockGetRoleByName,
        updateAccessPermissions: mockUpdateAccessPermissions,
      });

      expect(mockUpdateAccessPermissions).toHaveBeenCalledTimes(2);
      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(false);
    });

    it('should handle undefined configuration gracefully', async () => {
      const config = undefined;
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });
      const appConfig: AppConfig = {
        config: config as TCustomConfig,
        interfaceConfig,
      } as AppConfig;

      await updateInterfacePermissions({
        appConfig,
        getRoleByName: mockGetRoleByName,
        updateAccessPermissions: mockUpdateAccessPermissions,
      });

      expect(mockUpdateAccessPermissions).toHaveBeenCalledTimes(2);
      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(true);
    });
  });

  describe('Configuration precedence', () => {
    it('should prioritize explicit config over defaults', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false, // Explicit false
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true, // Default true, should be overridden
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      expect(interfaceConfig.fileSearch).toBe(true);
      expect(interfaceConfig.fileSearchSelected).toBe(false); // Should use explicit config
    });

    it('should use defaults when config values are undefined', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          // fileSearchSelected is undefined, should use default
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: false,
          fileSearchSelected: true, // Should be used
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      expect(interfaceConfig.fileSearch).toBe(true); // From config
      expect(interfaceConfig.fileSearchSelected).toBe(true); // From defaults
    });
  });

  describe('removeNullishValues behavior', () => {
    it('should exclude fileSearchSelected when undefined', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          // fileSearchSelected undefined
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          // fileSearchSelected also undefined in defaults
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      expect(interfaceConfig).not.toHaveProperty('fileSearchSelected');
      expect(interfaceConfig.fileSearch).toBe(true);
    });

    it('should include fileSearchSelected when false (not nullish)', async () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          fileSearch: true,
          fileSearchSelected: false, // Explicit false should be included
        },
      };
      const configDefaults: TConfigDefaults = {
        interface: {
          fileSearch: true,
          fileSearchSelected: true,
        },
      };

      const interfaceConfig = await loadDefaultInterface({ config, configDefaults });

      expect(interfaceConfig).toHaveProperty('fileSearchSelected', false);
      expect(interfaceConfig.fileSearch).toBe(true);
    });
  });
});
