function unsupportedReplicaSetConfig(message) {
  const error = new Error(message);
  error.code = 'UNSUPPORTED_REPLICA_SET_CONFIG';
  return error;
}

function assertSupportedReplicaSetConfig(config, replicaSetName, memberHost) {
  if (config?._id !== replicaSetName) {
    throw unsupportedReplicaSetConfig(
      `Expected replica set '${replicaSetName}', found '${config?._id ?? 'unknown'}'`,
    );
  }
  if (!Array.isArray(config.members) || config.members.length !== 1) {
    throw unsupportedReplicaSetConfig(
      `The bundled MongoDB deployment requires exactly one member; found ${config.members?.length ?? 0}`,
    );
  }
  if (config.members[0].host !== memberHost) {
    throw unsupportedReplicaSetConfig(
      `Expected the bundled MongoDB member '${memberHost}', found '${config.members[0].host}'`,
    );
  }
}

if (typeof module !== 'undefined') {
  module.exports = { assertSupportedReplicaSetConfig };
}
