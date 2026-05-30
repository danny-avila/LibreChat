import path from 'path';
import { pathToFileURL } from 'url';
// @ts-ignore
import { resolve as resolveTs } from 'ts-node/esm';
import * as tsConfigPaths from 'tsconfig-paths';

// @ts-ignore
const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig(
  path.resolve('./tsconfig.json'),  // Updated path
);
const matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);

export function resolve(specifier, context, defaultResolve) {
  const match = matchPath(specifier);
  if (match) {
    return resolveTs(pathToFileURL(match).href, context, defaultResolve);
  }
  return resolveTs(specifier, context, defaultResolve);
}

// @ts-ignore
export { load, getFormat, transformSource } from 'ts-node/esm';
// node -r dotenv/config --loader ./tsconfig-paths-bootstrap.mjs --experimental-specifier-resolution=node ../../api/demo/everything.ts