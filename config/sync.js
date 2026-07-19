const { execFileSync } = require('child_process');

const UPSTREAM_FALLBACK = 'https://github.com/danny-avila/LibreChat.git';
const STABLE_TAG = /^v\d+\.\d+\.\d+$/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const gitQuiet = (...args) => {
  try {
    return { ok: true, out: git(...args) };
  } catch (error) {
    return { ok: false, out: `${error.stdout || ''}${error.stderr || ''}`.trim() };
  }
};

const log = (message) => console.log(message);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const stableTags = (ref) =>
  git('tag', '--list', 'v[0-9]*', '--sort=-v:refname', ...(ref ? ['--merged', ref] : []))
    .split('\n')
    .filter((tag) => STABLE_TAG.test(tag));

const resolveUpstream = () => {
  const remotes = git('remote').split('\n').filter(Boolean);
  if (remotes.includes('upstream')) {
    return git('remote', 'get-url', 'upstream');
  }
  const parent = gitQuiet('config', '--get', 'librechat.upstream');
  return parent.ok && parent.out ? parent.out : UPSTREAM_FALLBACK;
};

const ensureCleanTree = () => {
  if (git('status', '--porcelain')) {
    fail('Working tree is dirty. Commit or stash your changes before syncing.');
  }
};

const syncTags = (upstream) => {
  const before = new Set(stableTags());
  log('→ Fetching tags from upstream…');
  git('fetch', upstream, 'refs/tags/*:refs/tags/*');

  const after = stableTags();
  const fresh = after.filter((tag) => !before.has(tag));

  log(fresh.length ? `  new stable tags: ${fresh.join(', ')}` : '  no new stable tags');

  log('→ Pushing tags to origin…');
  const pushed = gitQuiet('push', 'origin', '--tags');
  if (!pushed.ok) {
    fail(`Failed to push tags to origin:\n${pushed.out}`);
  }

  return after[0];
};

const syncMain = (upstream) => {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') {
    log(`→ Skipping main sync (currently on "${branch}", not main)`);
    return;
  }

  log('→ Fetching upstream main…');
  git('fetch', upstream, 'main');
  const behind = Number(git('rev-list', '--count', 'HEAD..FETCH_HEAD'));
  if (!behind) {
    log('  main is already up to date');
    return;
  }

  log(`  main is ${behind} commit(s) behind upstream; merging…`);
  const merged = gitQuiet('merge', '--no-edit', 'FETCH_HEAD');
  if (!merged.ok) {
    gitQuiet('merge', '--abort');
    fail(
      `Merge conflicts with upstream — the merge was aborted and nothing was pushed.\n` +
        `Resolve it by hand:\n  git merge FETCH_HEAD\n\n${merged.out}`,
    );
  }

  log('→ Pushing main to origin…');
  const pushed = gitQuiet('push', 'origin', 'main');
  if (!pushed.ok) {
    fail(`Failed to push main to origin:\n${pushed.out}`);
  }
};

const main = () => {
  ensureCleanTree();
  const upstream = resolveUpstream();
  log(`Upstream: ${upstream}\n`);

  const newest = syncTags(upstream);
  syncMain(upstream);

  log(`\n✔ Synced. Newest stable tag: ${newest}`);
  log(`\nBuild the image with:`);
  log(`  gh workflow run main-image-workflow.yml -f version=${newest}`);
};

main();
