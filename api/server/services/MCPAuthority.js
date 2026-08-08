const { MCPAuthorityProofResolver, getMCPToolCatalogRevision } = require('@librechat/api');
const { digestMCPAuthorityValue } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const db = require('~/models');

let resolver;
const MCP_AVAILABLE = Object.freeze({ available: true });
let availability = MCP_AVAILABLE;

class MCPUnavailableError extends Error {
  constructor(current) {
    super(current.message);
    this.name = 'MCPUnavailableError';
    this.code = 'MCP_UNAVAILABLE';
    this.reason = current.reason;
    this.status = 503;
    this.statusCode = 503;
    this.retryable = current.retryable;
  }
}

function setMCPAvailability(next) {
  if (next?.available === true) {
    availability = MCP_AVAILABLE;
    return availability;
  }
  const reason =
    typeof next?.reason === 'string' && next.reason ? next.reason : 'proof_unavailable';
  const message =
    typeof next?.message === 'string' && next.message
      ? next.message
      : 'MCP authority is unavailable';
  availability = Object.freeze({
    available: false,
    reason,
    message,
    retryable: next?.retryable === true,
  });
  resolver = undefined;
  return availability;
}

function getMCPAvailability() {
  return availability;
}

function assertMCPAvailable() {
  if (!availability.available) {
    throw new MCPUnavailableError(availability);
  }
}

function initializeMCPAuthority(appConfig) {
  const immutableConfig = appConfig?.config ?? {};
  const configuredRevision = String(immutableConfig.version ?? '').trim();
  const bootRevision = configuredRevision || Constants.CONFIG_VERSION;
  resolver = new MCPAuthorityProofResolver({
    methods: {
      resolveMCPAuthorityProof: db.resolveMCPAuthorityProof,
      assertMCPAuthorityProofsCurrent: db.assertMCPAuthorityProofsCurrent,
    },
    bootRevision,
    immutableConfig: {
      mcpServers: immutableConfig.mcpServers,
      mcpSettings: immutableConfig.mcpSettings,
    },
  });
  availability = MCP_AVAILABLE;
  return resolver;
}

function getMCPAuthorityResolver() {
  assertMCPAvailable();
  if (!resolver) {
    throw new Error('MCP authority resolver has not been initialized.');
  }
  return resolver;
}

function canonicalSchema(schema, key) {
  const definition = schema?.function ?? schema ?? {};
  return {
    key,
    name: definition.name ?? null,
    description: definition.description ?? null,
    parameters: definition.parameters ?? definition.inputSchema ?? null,
    outputSchema: definition.outputSchema ?? null,
    annotations: definition.annotations ?? null,
  };
}

function canonicalSchemas(schemas) {
  if (schemas == null) {
    return [];
  }
  if (Array.isArray(schemas)) {
    return schemas
      .map((schema, index) => canonicalSchema(schema, String(index)))
      .sort((left, right) =>
        `${left.name}:${left.key}`.localeCompare(`${right.name}:${right.key}`),
      );
  }
  if (schemas.function || schemas.name || schemas.inputSchema || schemas.parameters) {
    return [canonicalSchema(schemas, '')];
  }
  return Object.entries(schemas)
    .map(([key, schema]) => canonicalSchema(schema, key))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function calculateMCPAuthorityArtifactRevision({ parsedConfig, schemas }) {
  const records = Array.isArray(parsedConfig) ? parsedConfig : [parsedConfig];
  return digestMCPAuthorityValue({
    records: records
      .map((record) => ({
        serverName: record.serverName,
        configRevision: getMCPToolCatalogRevision(record.sourceConfig),
        effectiveConfigRevision: getMCPToolCatalogRevision(record.effectiveConfig),
        securityPolicyIdentity: record.securityPolicyIdentity,
        authorizationIdentity: record.authorization.identity,
        authorizationKind: record.authorization.kind,
        authorizationCredentialSetId: record.authorization.credentialSetId,
        authorizationGeneration: record.authorization.generation,
        catalogScope: record.catalogScope,
        discoveryProvenance: record.discoveryProvenance,
      }))
      .sort((left, right) => left.serverName.localeCompare(right.serverName)),
    schemas: canonicalSchemas(schemas),
  });
}

module.exports = {
  MCPUnavailableError,
  assertMCPAvailable,
  calculateMCPAuthorityArtifactRevision,
  getMCPAvailability,
  getMCPAuthorityResolver,
  initializeMCPAuthority,
  setMCPAvailability,
};
