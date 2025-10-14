import { KeyvFile } from 'keyv-file';

export const logFile = new KeyvFile({ filename: './data/logs.json' }).setMaxListeners(20);
export const violationFile = new KeyvFile({ filename: './data/violations.json' }).setMaxListeners(
  20,
);
