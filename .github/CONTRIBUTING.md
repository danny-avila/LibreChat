# Contributor Guidelines

Thank you to all the contributors who have helped make this project possible! We welcome various types of contributions, such as bug reports, documentation improvements, feature requests, and code contributions.

## Contributing Guidelines

If the feature you would like to contribute has not already received prior approval from the project maintainers (i.e., the feature is currently on the [roadmap](https://github.com/users/danny-avila/projects/2)), please submit a request in the [Feature Requests & Suggestions category](https://github.com/danny-avila/LibreChat/discussions/new?category=feature-requests-suggestions) of the discussions board before beginning work on it. The requests should include specific implementation details, including areas of the application that will be affected by the change (including designs if applicable), and any other relevant information that might be required for a speedy review. However, proposals are not required for small changes, bug fixes, or documentation improvements. Small changes and bug fixes should be tied to an [issue](https://github.com/danny-avila/LibreChat/issues) and included in the corresponding pull request for tracking purposes.

Please note that a pull request involving a feature that has not been reviewed and approved by the project maintainers may be rejected. We appreciate your understanding and cooperation.

If you would like to discuss the changes you wish to make, join our [Discord community](https://discord.librechat.ai), where you can engage with other contributors and seek guidance from the community.

## Our Standards

We strive to maintain a positive and inclusive environment within our project community. We expect all contributors to adhere to the following standards:

- Using welcoming and inclusive language.
- Being respectful of differing viewpoints and experiences.
- Gracefully accepting constructive criticism.
- Focusing on what is best for the community.
- Showing empathy towards other community members.

Project maintainers have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that do not align with these standards.

## To contribute to this project, please adhere to the following guidelines:

## 1. Development Setup

1. Use Node.js v20.19.0+ or ^22.12.0 or >= 23.0.0.
2. Run `npm run smart-reinstall` to install dependencies (uses Turborepo). Use `npm run reinstall` for a clean install, or `npm ci` for a fresh lockfile-based install.
3. Build all compiled code: `npm run build`.
4. Setup and run unit tests:
    - Copy `.env.test`: `cp api/test/.env.test.example api/test/.env.test`.
    - Run backend unit tests: `npm run test:api`.
    - Run frontend unit tests: `npm run test:client`.
5. Setup and run integration tests:
    - Create `.env`: `cp .env.example .env`.
    - Install [MongoDB Community Edition](https://www.mongodb.com/docs/manual/administration/install-community/), ensure that `mongosh` connects to your local instance.
    - Run: `npx install playwright`, then `npx playwright install`.
    - Copy `config.local`: `cp e2e/config.local.example.ts e2e/config.local.ts`.
    - Copy `librechat.yaml`: `cp librechat.example.yaml librechat.yaml`.
    - Run: `npm run e2e`.

## 2. Development Notes

1. Before starting work, make sure your main branch has the latest commits with `npm run update`.
2. Run linting command to find errors: `npm run lint`. Alternatively, ensure husky pre-commit checks are functioning.
3. After your changes, reinstall packages in your current branch using `npm run reinstall` and ensure everything still works. 
    - Restart the ESLint server ("ESLint: Restart ESLint Server" in VS Code command bar) and your IDE after reinstalling or updating.
4. Clear web app localStorage and cookies before and after changes.
5. To check for introduced errors, build all compiled code: `npm run build`.
6. Run backend unit tests: `npm run test:api`.
7. Run frontend unit tests: `npm run test:client`.
8. Run integration tests: `npm run e2e`.

## 3. Git Workflow

We utilize a GitFlow workflow to manage changes to this project's codebase. Follow these general steps when contributing code:

1. Fork the repository and create a new branch with a descriptive slash-based name (e.g., `new/feature/x`).
2. Implement your changes and ensure that all tests pass.
3. Commit your changes using conventional commit messages with GitFlow flags. Begin the commit message with a tag indicating the change type, such as "feat" (new feature), "fix" (bug fix), "docs" (documentation), or "refactor" (code refactoring), followed by a brief summary of the changes (e.g., `feat: Add new feature X to the project`).
4. Submit a pull request with a clear and concise description of your changes and the reasons behind them.
5. We will review your pull request, provide feedback as needed, and eventually merge the approved changes into the main branch.

## 4. Commit Message Format

We follow the [semantic format](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716) for commit messages.

### Example

```
feat: add hat wobble
^--^  ^------------^
|     |
|     +-> Summary in present tense.
|
+-------> Type: chore, docs, feat, fix, refactor, style, or test.
```

### Commit Guidelines
- Do your best to reduce the number of commits, organizing them as much possible. Look into [squashing commits](https://www.freecodecamp.org/news/git-squash-commits/) in order to keep a neat history.
- For those that care about maximizing commits for stats, adhere to the above as I 'squash and merge' an unorganized and/or unformatted commit history, which reduces the number of your commits to 1,:
```
* Update Br.tsx

* Update Es.tsx

* Update Br.tsx
```


## 5. Pull Request Process

When submitting a pull request, please follow these guidelines:

- Ensure that any installation or build dependencies are removed before the end of the layer when doing a build.
- Update the README.md with details of changes to the interface, including new environment variables, exposed ports, useful file locations, and container parameters.
- Increase the version numbers in any example files and the README.md to reflect the new version that the pull request represents. We use [SemVer](http://semver.org/) for versioning.

Ensure that your changes meet the following criteria:

- All tests pass as highlighted [above](#1-development-notes).
- The code is well-formatted and adheres to our coding standards.
- The commit history is clean and easy to follow. You can use `git rebase` or `git merge --squash` to clean your commit history before submitting the pull request.
- The pull request description clearly outlines the changes and the reasons behind them. Be sure to include the steps to test the pull request.

## 6. Naming Conventions

Apply the following naming conventions to branches, labels, and other Git-related entities:

- **Branch names:** Descriptive and slash-based (e.g., `new/feature/x`).
- **Labels:** Descriptive and kebab case (e.g., `bug-fix`).
- **JS/TS:** Directories and file names: Descriptive and camelCase. First letter uppercased for React files (e.g., `helperFunction.ts, ReactComponent.tsx`).
- **Docs:** Directories and file names: Descriptive and snake_case (e.g., `config_files.md`).

## 7. Coding Standards

For detailed coding conventions, workspace boundaries, and architecture guidance, refer to the [`AGENTS.md`](../AGENTS.md) file at the project root. It covers code style, type safety, import ordering, iteration/performance expectations, frontend rules, testing, and development commands.

## 8. TypeScript Conversion

1. **Original State**: The project was initially developed entirely in JavaScript (JS).

2. **Frontend**: Fully transitioned to TypeScript.

3. **Backend**:
   - The legacy Express.js server remains in `/api` as JavaScript.
   - All new backend code is written in TypeScript under `/packages/api`, which is compiled and consumed by `/api`.
   - Shared database logic lives in `/packages/data-schemas` (TypeScript).
   - Shared frontend/backend API types and services live in `/packages/data-provider` (TypeScript).
   - Minimize direct changes to `/api`; prefer adding TypeScript code to `/packages/api` and importing it.

## 9. Module Import Conventions

Imports are organized into three sections (in order):

1. **Package imports** — sorted from shortest to longest line length.
   - `react` is always the first import.
   - Multi-line (stacked) imports count their total character length across all lines for sorting.

2. **`import type` imports** — sorted from longest to shortest line length.
   - Package type imports come first, then local type imports.
   - Line length sorting resets between the package and local sub-groups.

3. **Local/project imports** — sorted from longest to shortest line length.
   - Multi-line (stacked) imports count their total character length across all lines for sorting.
   - Imports with alias `~` are treated the same as relative imports with respect to line length.

- Consolidate value imports from the same module as much as possible.
- Always use standalone `import type { ... }` for type imports; never use inline `type` keyword inside value imports (e.g., `import { Foo, type Bar }` is wrong).

**Note:** ESLint will automatically enforce these import conventions when you run `npm run lint --fix` or through pre-commit hooks.

For the full set of coding standards, see [`AGENTS.md`](../AGENTS.md).

---

## [Go Back to ReadMe](../README.md)
