# GitHub Queries

Commands backing the Codex PR Review Loop skill. Use `gh` where it exists; use the GitHub MCP
equivalents in the last section where it does not.

## 1. Locate the PR and its exact head

```bash
gh pr list --head "$(git branch --show-current)" --state open --json number,title,headRepositoryOwner
gh pr view <pr-number> --json number,headRefName,headRefOid,headRepositoryOwner,isCrossRepository
```

`headRefOid` is the only acceptable source for the SHA named in a review trigger. Read it fresh
immediately before posting — never carry one forward from an earlier read, and never substitute the
local branch tip.

## 2. Fetch inline review threads

There is no REST endpoint for review threads; inline comments must come from GraphQL.

```bash
gh api graphql \
  -F owner='<owner>' \
  -F repo='<repo>' \
  -F pr=<pr-number> \
  -f query='query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        headRefOid
        reviewThreads(first:100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first:20) {
              nodes {
                databaseId
                body
                createdAt
                url
                author { login }
              }
            }
          }
        }
      }
    }
  }'
```

Filter to threads whose root comment author is the Codex connector:

- GraphQL returns `chatgpt-codex-connector`
- REST returns `chatgpt-codex-connector[bot]`

Then rank by `isResolved == false` first, and read `createdAt` against the timestamp of the latest
`@codex review` trigger to separate this cycle's findings from earlier ones. `isOutdated == true`
means the line moved, not that the finding is wrong — verify against current code before dismissing.

## 3. Confirm which commit was reviewed

```bash
gh api graphql \
  -F owner='<owner>' -F repo='<repo>' -F pr=<pr-number> \
  -f query='query($owner:String!, $repo:String!, $pr:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$pr) {
        reviews(last:20) {
          nodes { body submittedAt commit { oid } author { login } }
        }
      }
    }
  }'
```

The review body contains a `**Reviewed commit:** \`<short-sha>\`` line. Match it against the
`headRefOid` you requested. A review of an earlier head is not a clean result for the current head.

## 4. Trigger a review and confirm pickup

```bash
gh pr comment <pr-number> --body "$(cat <<'BODY'
@codex review

Please review the current PR head <full-head-sha>. Confirm that this exact commit is the reviewed commit and ignore findings that apply only to earlier heads.
BODY
)"
```

Poll the trigger comment for the `eyes` reaction:

```bash
gh api "repos/<owner>/<repo>/issues/comments/<comment-id>/reactions" --jq '.[].content'
```

- `eyes` → Codex picked it up; start the review polling window.
- `+1` → Codex found nothing on that head. Clean result; still confirm no inline threads landed.
- no reaction after 1-2 minutes → delete and retry:

```bash
gh api -X DELETE "repos/<owner>/<repo>/issues/comments/<comment-id>"
```

Recent issue comments, to find the ID you just created:

```bash
gh api "repos/<owner>/<repo>/issues/<pr-number>/comments" --jq '.[-5:] | .[] | {id, user: .user.login, created_at}'
```

## 5. Reply to a review thread

Reply on the thread itself, not as a new top-level comment:

```bash
gh api "repos/<owner>/<repo>/pulls/<pr-number>/comments/<root-comment-databaseId>/replies" \
  -f body='Fixed in <sha>. <what changed>. Covered by <test>.'
```

## 6. Watch CI

```bash
gh pr checks <pr-number> --watch
gh run view <run-id> --log-failed
```

## MCP equivalents

When `gh` is unavailable (Claude Code on the web), the same steps map to GitHub MCP tools:

| Step | Tool |
|---|---|
| PR metadata and head SHA | `pull_request_read` — `get` |
| Inline review threads | `pull_request_read` — `get_review_comments` (returns `isResolved`, `isOutdated`, and thread comments) |
| Review bodies and reviewed commit | `pull_request_read` — `get_reviews` |
| Top-level comments | `pull_request_read` — `get_comments` |
| Post the `@codex review` trigger | `add_issue_comment` |
| Reply on a review thread | `add_reply_to_pull_request_comment` |
| CI status | `pull_request_read` — `get_check_runs`, then `get_job_logs` with `failed_only` |

Reaction polling has no MCP tool. Where reactions cannot be read, fall back to polling
`get_reviews` and `get_review_comments` for new entries against the requested head, and treat a
review whose `Reviewed commit` matches the requested SHA as the pickup signal.
