/**
 * `https://github.com/{owner}/{name}/pull/{number}`, ending where the number does. A `/pull/new/`
 * page (what `git push` suggests) has no number and never matches.
 */
const PULL_REQUEST_URL =
  /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?![\w-])/g;

/**
 * The pull request of `repo` that command output links to, the last one when it links several,
 * since tools such as `gh pr create` print the link they made last. Links to any other repository
 * are ignored, so output that mentions another project's pull request cannot claim the lane.
 */
export function findPullRequestLink(output: string, repo: string): number | null {
  if (!output.includes('/pull/')) return null;
  const wanted = repo.toLowerCase();
  let found: number | null = null;
  for (const match of output.matchAll(PULL_REQUEST_URL)) {
    const [, owner, name, digits] = match;
    if (`${owner}/${name}`.toLowerCase() !== wanted) continue;
    const number = Number(digits);
    if (Number.isSafeInteger(number) && number > 0) found = number;
  }
  return found;
}
