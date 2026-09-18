import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { inOneProject, repoRoot, run } from './lint.helpers';

/**
 * Every job on this pull request died in `npm ci`: the lockfile entries the stack
 * added resolved to a private mirror that no GitHub runner and no contributor can
 * reach. What a clean install needs is that each locked tarball comes from a host
 * this repository already installs from, and that the registry actually serves
 * it — so the hosts are checked for the whole lockfile and the tarballs are then
 * asked for. Neither half depends on this being a branch: the same assertions
 * hold on `dev` and after this change merges.
 */

type LockEntry = { resolved?: string; integrity?: string; version?: string; link?: boolean };
type Lockfile = { packages: Record<string, LockEntry> };

const PUBLIC_REGISTRY = 'registry.npmjs.org';

/**
 * The one non-registry host this repository installs from: `xlsx` is published
 * on SheetJS's own CDN. It is named here so a second vendor host is a failure
 * rather than a silent precedent.
 */
const INHERITED_HOSTS = ['cdn.sheetjs.com'];

/** Workspace links resolve to a directory in this repo, not to a tarball; every
 *  other `resolved` is a URL, and one that is not `https` is itself the
 *  failure, so it is reported as an unusable host rather than skipped. */
const tarballHost = (entry: LockEntry): string | undefined => {
  if (entry.link || !entry.resolved) return undefined;
  if (!entry.resolved.startsWith('https://')) return `insecure:${entry.resolved}`;
  return new URL(entry.resolved).host;
};

test.describe('the locked dependency set', () => {
  test('every locked package resolves from the public registry @scenario:every-locked-package-resolves-from-the-public-registry', () => {
    inOneProject();
    test.setTimeout(180_000);

    const head = JSON.parse(
      readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'),
    ) as Lockfile;
    const entries = Object.entries(head.packages);
    expect(entries.length).toBeGreaterThan(0);

    const allowed = [PUBLIC_REGISTRY, ...INHERITED_HOSTS];
    const foreign = entries
      .filter(([, entry]) => {
        const host = tarballHost(entry);
        return host !== undefined && !allowed.includes(host);
      })
      .map(([name, entry]) => `${name} -> ${entry.resolved}`);
    expect(
      foreign,
      'a locked tarball outside the public registry cannot be installed in CI',
    ).toEqual([]);

    /** Every entry the branch introduces is held to the same host, named rather
     *  than counted, so a lockfile written against a private mirror says which
     *  package brought it. A package this repository already installs from an
     *  inherited host keeps it across a version bump — upgrading `xlsx` is not
     *  the same act as introducing a second vendor host, which is what this
     *  assertion is for. When the base ref is not fetched — the mock lane clones
     *  shallow — there is nothing to compare against and the sweep above has
     *  already covered the whole file. */
    const base = run('git', ['show', 'origin/dev:package-lock.json']);
    if (base.status === 0) {
      const previous = (JSON.parse(base.stdout) as Lockfile).packages;
      const introduced = entries.filter(
        ([name, entry]) =>
          Boolean(entry.resolved) && (!previous[name] || previous[name].version !== entry.version),
      );
      const offRegistry = introduced
        .filter(([name, entry]) => {
          const host = tarballHost(entry);
          if (host === PUBLIC_REGISTRY) return false;
          const before = previous[name] ? tarballHost(previous[name]) : undefined;
          return !(host !== undefined && host === before && INHERITED_HOSTS.includes(host));
        })
        .map(([name, entry]) => `${name} -> ${entry.resolved}`);
      expect(offRegistry, 'a package this branch adds resolves from somewhere else').toEqual([]);
    }

    /** A declared dependency with no entry of its own is the other way a clean
     *  install reaches the network: `npm ci` would resolve it live. */
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    const unlocked = declared.filter(
      (name) => !head.packages[`node_modules/${name}`] && !head.packages[name],
    );
    expect(
      unlocked,
      'a declared dependency has no lockfile entry; npm ci would resolve it live',
    ).toEqual([]);

    /** Deliberately no request to the registry: whether it serves these tarballs
     *  today is what `npm ci` in this very job already proved, and a 429 from a
     *  rate limit would otherwise fail a pull request that changed none of this.
     *  What the lockfile says is what this scenario owns. */
  });
});
