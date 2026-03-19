import { Permissions, PermissionTypes, permissionsSchema } from './permissions';
import { SystemRoles, roleDefaults } from './roles';

const RESOURCE_MANAGEMENT_FIELDS: string[] = [
  Permissions.CREATE,
  Permissions.SHARE,
  Permissions.SHARE_PUBLIC,
];

/**
 * Permission types that manage shared resources (agents, prompts, etc.)
 * where CREATE/SHARE should be restricted for USER by default.
 * MEMORIES is excluded because its CREATE/READ/UPDATE apply to the user's own data.
 */
const RESOURCE_PERMISSION_TYPES: PermissionTypes[] = [
  PermissionTypes.MCP_SERVERS,
  PermissionTypes.REMOTE_AGENTS,
];

describe('roleDefaults', () => {
  describe('USER role', () => {
    const userPerms = roleDefaults[SystemRoles.USER].permissions;

    it('should have explicit values for every field in every multi-field permission type', () => {
      const schemaShape = permissionsSchema.shape;

      for (const [permType, subSchema] of Object.entries(schemaShape)) {
        const fieldNames = Object.keys(subSchema.shape);
        if (fieldNames.length <= 1) {
          continue;
        }

        const userValues =
          userPerms[permType as PermissionTypes] as Record<string, boolean>;

        for (const field of fieldNames) {
          expect({
            permType,
            field,
            value: userValues[field],
          }).toEqual(
            expect.objectContaining({
              permType,
              field,
              value: expect.any(Boolean),
            }),
          );
        }
      }
    });

    it('should never grant CREATE, SHARE, or SHARE_PUBLIC by default for resource-management types', () => {
      for (let i = 0; i < RESOURCE_PERMISSION_TYPES.length; i++) {
        const permType = RESOURCE_PERMISSION_TYPES[i];
        const permissions = userPerms[permType] as Record<string, boolean>;
        for (const field of RESOURCE_MANAGEMENT_FIELDS) {
          if (permissions[field] === undefined) {
            continue;
          }
          expect({
            permType,
            field,
            value: permissions[field],
          }).toEqual(
            expect.objectContaining({
              permType,
              field,
              value: false,
            }),
          );
        }
      }
    });

    it('should cover every permission type that has CREATE, SHARE, or SHARE_PUBLIC fields', () => {
      const schemaShape = permissionsSchema.shape;
      const resourceMgmtFieldSet = RESOURCE_MANAGEMENT_FIELDS;
      const resourcePermTypeSet = RESOURCE_PERMISSION_TYPES as string[];

      for (const [permType, subSchema] of Object.entries(schemaShape)) {
        const fieldNames = Object.keys(subSchema.shape);
        const hasResourceFields = fieldNames.some((f) => resourceMgmtFieldSet.includes(f));
        if (!hasResourceFields) {
          continue;
        }

        const isTracked =
          resourcePermTypeSet.includes(permType) ||
          permType === PermissionTypes.MEMORIES ||
          permType === PermissionTypes.PROMPTS ||
          permType === PermissionTypes.AGENTS;

        expect({
          permType,
          tracked: isTracked,
        }).toEqual(
          expect.objectContaining({
            permType,
            tracked: true,
          }),
        );
      }
    });
  });

  describe('ADMIN role', () => {
    const adminPerms = roleDefaults[SystemRoles.ADMIN].permissions;

    it('should have explicit values for every field in every permission type', () => {
      const schemaShape = permissionsSchema.shape;

      for (const [permType, subSchema] of Object.entries(schemaShape)) {
        const fieldNames = Object.keys(subSchema.shape);
        const adminValues =
          adminPerms[permType as PermissionTypes] as Record<string, boolean>;

        for (const field of fieldNames) {
          expect({
            permType,
            field,
            value: adminValues[field],
          }).toEqual(
            expect.objectContaining({
              permType,
              field,
              value: expect.any(Boolean),
            }),
          );
        }
      }
    });
  });
});
