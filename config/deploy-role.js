const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { SYSTEM_TENANT_ID } = require('@librechat/data-schemas');
const { configSchema, permissionsSchema, SystemRoles } = require('librechat-data-provider');

const systemRoleNames = new Set(Object.values(SystemRoles));

const roleDefinitionsSchema = z
  .array(
    z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .refine((name) => !systemRoleNames.has(name.toUpperCase()), {
            message: 'System roles cannot be deployed as custom roles',
          }),
        description: z.string().optional(),
        inheritPermissionsFrom: z.string().trim().min(1),
        permissionOverrides: permissionsSchema.deepPartial(),
        config: z
          .object({
            priority: z.number().nonnegative(),
            overrides: configSchema.deepPartial(),
          })
          .strict(),
      })
      .strict(),
  )
  .min(1, 'Role definitions must be a non-empty array');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergePermissions(base, overrides) {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] =
      isObject(value) && isObject(merged[key])
        ? mergePermissions(merged[key], value)
        : structuredClone(value);
  }
  return merged;
}

function rejectUnknownFields(parsed, input, fieldPath = 'definitions') {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    input.forEach((value, index) =>
      rejectUnknownFields(parsed[index], value, `${fieldPath}.${index}`),
    );
    return;
  }
  if (!isObject(input) || !isObject(parsed)) {
    return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(parsed, key)) {
      throw new TypeError(`Unknown role definition field: ${fieldPath}.${key}`);
    }
    rejectUnknownFields(parsed[key], value, `${fieldPath}.${key}`);
  }
}

function validateRoleDefinitions(input) {
  const parsed = roleDefinitionsSchema.parse(input);
  rejectUnknownFields(parsed, input);
  return parsed.map((definition, index) => ({
    ...definition,
    config: {
      ...definition.config,
      overrides: input[index].config.overrides,
    },
  }));
}

function getFlagValue(args, name) {
  const assignment = args.find((arg) => arg.startsWith(`${name}=`));
  if (assignment) {
    return assignment.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function loadRoleDefinitions(args) {
  const inline = getFlagValue(args, '--roles') ?? process.env.ROLE_DEFINITIONS_JSON;
  const file =
    getFlagValue(args, '--file') ??
    args.find(
      (arg, index) =>
        !arg.startsWith('--') && !['--roles', '--file', '--tenant'].includes(args[index - 1]),
    ) ??
    process.env.ROLE_DEFINITIONS_FILE;
  if (!inline && !file) {
    throw new Error('Pass role definitions with --roles <json> or --file <path>');
  }

  const source = inline ?? fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const definitions = validateRoleDefinitions(JSON.parse(source));
  console.log(
    `Loaded role definitions from ${inline ? 'the inline parameter' : path.resolve(process.cwd(), file)}`,
  );
  return definitions;
}

function getDeploymentScope(args) {
  const base = args.includes('--base');
  const tenantId = getFlagValue(args, '--tenant');
  if (args.some((arg) => arg === '--tenant' || arg.startsWith('--tenant='))) {
    if (!tenantId || tenantId.startsWith('--')) {
      throw new Error('--tenant requires a tenant ID');
    }
    if (tenantId === SYSTEM_TENANT_ID) {
      throw new Error(`--tenant cannot use the reserved tenant ID "${SYSTEM_TENANT_ID}"`);
    }
  }
  if (base === Boolean(tenantId)) {
    throw new Error('Pass exactly one deployment scope: --base or --tenant <tenant-id>');
  }
  return tenantId ? { tenantId } : { base: true };
}

async function deployRole(definition, service) {
  const baseline = await service.getRole(definition.inheritPermissionsFrom);
  if (!baseline) {
    throw new Error(`Baseline role "${definition.inheritPermissionsFrom}" was not found`);
  }
  console.green(`Found ${definition.inheritPermissionsFrom} role`);

  const role = {
    name: definition.name,
    description: definition.description,
    permissions: mergePermissions(baseline.permissions ?? {}, definition.permissionOverrides),
  };
  const existing = await service.getRole(role.name);
  if (existing) {
    if (role.description !== undefined) {
      await service.updateRole(role.name, { description: role.description });
    }
    await service.updateRolePermissions(role.name, role.permissions);
  } else {
    await service.createRole(role);
  }
  await service.upsertRoleConfig(role.name, definition.config);
  console.green(`Created/updated ${definition.name} role, permissions, and config`);
}

async function main() {
  require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
  const mongoose = require('mongoose');
  const { createModels, runAsSystem, tenantStorage } = require('@librechat/data-schemas');
  const { createRoleAdminService } = require('@librechat/api');
  const { invalidateConfigCaches } = require('~/server/services/Config');
  const db = require('~/models');
  const connect = require('./connect');

  mongoose.set('autoIndex', false);
  createModels(mongoose);

  let exitCode = 0;
  try {
    const args = process.argv.slice(2);
    const definitions = loadRoleDefinitions(args);
    const scope = getDeploymentScope(args);
    await connect();
    const baseOnly = { baseOnly: true };
    const permissionOptions = { ...(scope.base ? baseOnly : {}), throwOnError: true };
    const roleDb = scope.base
      ? {
          getRoleByName: (name, fields) => db.getRoleByName(name, fields, baseOnly),
          createRoleByName: (role) => db.createRoleByName(role, baseOnly),
          updateRoleByName: (name, updates) => db.updateRoleByName(name, updates, baseOnly),
          findConfigByPrincipal: (type, id, options, session) =>
            db.findConfigByPrincipal(type, id, { ...options, ...baseOnly }, session),
          upsertConfig: (type, id, model, overrides, priority, session, options) =>
            db.upsertConfig(type, id, model, overrides, priority, session, {
              ...options,
              ...baseOnly,
            }),
        }
      : db;
    const updateAccessPermissions = (name, permissions, role) =>
      db.updateAccessPermissions(name, permissions, role, permissionOptions);
    const service = createRoleAdminService({
      getRoleByName: roleDb.getRoleByName,
      createRoleByName: roleDb.createRoleByName,
      updateRoleByName: roleDb.updateRoleByName,
      updateAccessPermissions,
      findUserIdsByRole: db.findUserIdsByRole,
      updateUsersByRole: db.updateUsersByRole,
      updateUsersRoleByIds: db.updateUsersRoleByIds,
      renameConfigPrincipal: db.renameConfigPrincipal,
      findConfigByPrincipal: roleDb.findConfigByPrincipal,
      upsertConfig: roleDb.upsertConfig,
      invalidateConfigCaches: () => invalidateConfigCaches(scope.tenantId),
    });
    const deploy = async () => {
      for (const definition of definitions) {
        await deployRole(definition, service);
      }
    };
    await (scope.base
      ? runAsSystem(deploy)
      : tenantStorage.run({ tenantId: scope.tenantId }, deploy));
    console.green('Deployment completed');
  } catch (error) {
    exitCode = 1;
    console.error('Role deployment failed:', error);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (error) {
      exitCode = 1;
      console.error('Failed to disconnect from MongoDB:', error);
    }
  }
  process.exit(exitCode);
}

if (require.main === module) {
  void main();
}

module.exports = {
  deployRole,
  getDeploymentScope,
  loadRoleDefinitions,
  mergePermissions,
  validateRoleDefinitions,
};
