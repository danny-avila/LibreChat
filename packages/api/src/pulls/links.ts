/**
 * A pull request page on any provider, ending where the number does: GitHub's
 * `/{owner}/{name}/pull/{n}`, GitLab's `/{group}/.../{name}/-/merge_requests/{n}` and Bitbucket's
 * `/{workspace}/{name}/pull-requests/{n}`. A `/pull/new/` page (what `git push` suggests) has no
 * number and never matches. Any host matches: the number is only a candidate, which the lookup
 * reads from the configured provider and accepts only when its head is the lane's branch.
 */
const PULL_REQUEST_URL =
  /https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/((?:[A-Za-z0-9_.-]+\/)+?[A-Za-z0-9_.-]+)\/(?:pull|-\/merge_requests|pull-requests)\/(\d+)(?![\w-])/g;
const MARKERS = ['/pull/', '/merge_requests/', '/pull-requests/'];

/**
 * The pull request of `repo` that command output links to, the last one when it links several,
 * since tools such as `gh pr create` print the link they made last. Links to any other repository
 * are ignored, so output that mentions another project's pull request cannot claim the lane.
 */
export function findPullRequestLink(output: string, repo: string): number | null {
  if (!MARKERS.some((marker) => output.includes(marker))) return null;
  const wanted = repo.toLowerCase();
  let found: number | null = null;
  for (const match of output.matchAll(PULL_REQUEST_URL)) {
    const [, path, digits] = match;
    if (path.toLowerCase() !== wanted) continue;
    const number = Number(digits);
    if (Number.isSafeInteger(number) && number > 0) found = number;
  }
  return found;
}
