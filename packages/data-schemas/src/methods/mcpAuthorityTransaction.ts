import type { TransactionOptions } from 'mongodb';

export const MCP_AUTHORITY_SNAPSHOT_TRANSACTION_OPTIONS: Readonly<TransactionOptions> =
  Object.freeze({
    readPreference: 'primary',
    readConcern: Object.freeze({ level: 'snapshot' }),
    writeConcern: Object.freeze({ w: 'majority' }),
  }) satisfies TransactionOptions;
