See CLAUDE.md.

## Branching and pull requests

Branch off `dev` and target `dev` with every pull request; `gh pr create` defaults to `main`, so
pass `--base dev` explicitly. `main` is the released branch, kept as a fast-forward of `dev` and
synced as-is — never open a backport pull request to `main`, because anything merged to `dev`
reaches it at the next sync. Pull requests opened against `main` are retargeted automatically.
`Fixes #N` does not close the issue on a `dev` merge — GitHub honors closing keywords only on the
default branch, so close linked issues by hand. Worktrees share one stash stack, so never use a bare
`git stash pop`. See the detailed policy in `CLAUDE.md` under "Branching and Pull Requests".

## Verification

A green build is not a typecheck: `packages/api`, `packages/client` and `packages/data-schemas` build
with `tsdown`, which emits without checking types. Run `npx tsc --noEmit` in the workspace you
changed. `packages/client` excludes `*.spec.ts(x)` and `*.test.ts(x)` from typechecking entirely.
`npm run sort-imports` with no arguments rewrites every source root — pass the paths you touched. See
`CLAUDE.md` under "Typechecking" and "Formatting".

## Frontend theming and styling

For frontend work, compose existing `@librechat/client` primitives and variants before adding
feature-local styles. Use semantic theme/Tailwind roles for color and shared appearance; do not
introduce raw palette utilities, hard-coded colors, or arbitrary theme CSS. If the system cannot
express a reusable design need, deepen the shared primitive or versioned theme-token registry
instead of copying classes into a feature. Keep genuine layout and behavior local, and document
why any new custom CSS cannot be expressed by the shared system. See the detailed policy in
`CLAUDE.md` under “Theming and styling.”

## Backend auth cache

When adding or changing code that mutates user documents, invalidate the auth user document cache
for affected users, including bulk role and user mutations. See the detailed policy in `CLAUDE.md`
under “Auth cache invalidation”.
