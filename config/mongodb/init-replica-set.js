/* global load, db, rs, assertSupportedReplicaSetConfig, quit, sleep */

load('/scripts/replica-set-config.js');

const replicaSetName = 'rs0';
const memberHost = 'mongodb:27017';
const deadline = Date.now() + 120_000;
let lastError;

while (Date.now() < deadline) {
  try {
    db.adminCommand({ ping: 1 });
    try {
      rs.status();
    } catch (error) {
      if (error.code !== 94 && error.codeName !== 'NotYetInitialized') {
        throw error;
      }
      rs.initiate({
        _id: replicaSetName,
        members: [{ _id: 0, host: memberHost }],
      });
    }

    assertSupportedReplicaSetConfig(rs.conf(), replicaSetName, memberHost);
    const status = db.adminCommand({ isMaster: 1 });
    if (status.setName !== replicaSetName) {
      throw new Error(
        `MongoDB initialized replica set '${status.setName}' instead of '${replicaSetName}'`,
      );
    }
    if (status.ismaster) {
      print(`MongoDB replica set '${replicaSetName}' is writable at ${memberHost}`);
      quit(0);
    }
  } catch (error) {
    if (error.code === 'UNSUPPORTED_REPLICA_SET_CONFIG') {
      throw error;
    }
    lastError = error;
  }
  sleep(1_000);
}

throw new Error(
  `MongoDB replica set '${replicaSetName}' did not become writable: ${lastError?.message ?? 'timeout'}`,
);
