import type TransportStream from 'winston-transport';

/**
 * Module augmentation for winston's transports namespace.
 *
 * `winston-daily-rotate-file` ships its own augmentation targeting
 * `'winston/lib/winston/transports'`, but it fails when winston and
 * winston-daily-rotate-file resolve from different node_modules trees
 * (which happens in this monorepo due to npm hoisting). This local
 * declaration bridges the gap so `tsc --noEmit` passes.
 */
declare module 'winston/lib/winston/transports' {
  interface Transports {
    DailyRotateFile: new (
      opts?: {
        level?: string;
        filename?: string;
        datePattern?: string;
        zippedArchive?: boolean;
        maxSize?: string | number;
        maxFiles?: string | number;
        dirname?: string;
        stream?: NodeJS.WritableStream;
        frequency?: string;
        utc?: boolean;
        extension?: string;
        createSymlink?: boolean;
        symlinkName?: string;
        auditFile?: string;
        format?: import('logform').Format;
      } & TransportStream.TransportStreamOptions,
    ) => TransportStream;
  }
}
