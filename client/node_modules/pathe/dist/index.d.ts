import path from 'path';

declare const sep = "/";
declare const delimiter = ":";
declare const normalize: typeof path.normalize;
declare const join: typeof path.join;
declare const resolve: typeof path.resolve;
declare function normalizeString(path: string, allowAboveRoot: boolean): string;
declare const isAbsolute: typeof path.isAbsolute;
declare const toNamespacedPath: typeof path.toNamespacedPath;
declare const extname: typeof path.extname;
declare const relative: typeof path.relative;
declare const dirname: typeof path.dirname;
declare const format: typeof path.format;
declare const basename: typeof path.basename;
declare const parse: typeof path.parse;

declare const _default: Omit<path.PlatformPath, "win32" | "posix">;

export { basename, _default as default, delimiter, dirname, extname, format, isAbsolute, join, normalize, normalizeString, parse, relative, resolve, sep, toNamespacedPath };
