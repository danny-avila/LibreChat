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

## 1. Development notes

1. Before starting work, make sure your main branch has the latest commits with `npm run update`
2. Run linting command to find errors: `npm run lint`. Alternatively, ensure husky pre-commit checks are functioning.
3. After your changes, reinstall packages in your current branch using `npm run reinstall` and ensure everything still works. 
    - Restart the ESLint server ("ESLint: Restart ESLint Server" in VS Code command bar) and your IDE after reinstalling or updating.
4. Clear web app localStorage and cookies before and after changes.
5. For frontend changes:
    - Install typescript globally: `npm i -g typescript`.
    - Compile typescript before and after changes to check for introduced errors: `cd client && tsc --noEmit`.
6. Run tests locally:
    - Backend unit tests: `npm run test:api`
    - Frontend unit tests: `npm run test:client`
    - Integration tests: `npm run e2e` (requires playwright installed, `npx install playwright`)

## 2. Git Workflow

We utilize a GitFlow workflow to manage changes to this project's codebase. Follow these general steps when contributing code:

1. Fork the repository and create a new branch with a descriptive slash-based name (e.g., `new/feature/x`).
2. Implement your changes and ensure that all tests pass.
3. Commit your changes using conventional commit messages with GitFlow flags. Begin the commit message with a tag indicating the change type, such as "feat" (new feature), "fix" (bug fix), "docs" (documentation), or "refactor" (code refactoring), followed by a brief summary of the changes (e.g., `feat: Add new feature X to the project`).
4. Submit a pull request with a clear and concise description of your changes and the reasons behind them.
5. We will review your pull request, provide feedback as needed, and eventually merge the approved changes into the main branch.

## 3. Commit Message Format

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


## 4. Pull Request Process

When submitting a pull request, please follow these guidelines:

- Ensure that any installation or build dependencies are removed before the end of the layer when doing a build.
- Update the README.md with details of changes to the interface, including new environment variables, exposed ports, useful file locations, and container parameters.
- Increase the version numbers in any example files and the README.md to reflect the new version that the pull request represents. We use [SemVer](http://semver.org/) for versioning.

Ensure that your changes meet the following criteria:

- All tests pass as highlighted [above](#1-development-notes).
- The code is well-formatted and adheres to our coding standards.
- The commit history is clean and easy to follow. You can use `git rebase` or `git merge --squash` to clean your commit history before submitting the pull request.
- The pull request description clearly outlines the changes and the reasons behind them. Be sure to include the steps to test the pull request.

## 5. Naming Conventions

Apply the following naming conventions to branches, labels, and other Git-related entities:

- **Branch names:** Descriptive and slash-based (e.g., `new/feature/x`).
- **Labels:** Descriptive and kebab case (e.g., `bug-fix`).
- **JS/TS:** Directories and file names: Descriptive and camelCase. First letter uppercased for React files (e.g., `helperFunction.ts, ReactComponent.tsx`).
- **Docs:** Directories and file names: Descriptive and snake_case (e.g., `config_files.md`).

## 6. TypeScript Conversion

1. **Original State**: The project was initially developed entirely in JavaScript (JS).

2. **Frontend Transition**:
   - We are in the process of transitioning the frontend from JS to TypeScript (TS).
   - The transition is nearing completion.
   - This conversion is feasible due to React's capability to intermix JS and TS prior to code compilation. It's standard practice to compile/bundle the code in such scenarios.

3. **Backend Considerations**:
   - Transitioning the backend to TypeScript would be a more intricate process, especially for an established Express.js server.
   
   - **Options for Transition**:
      - **Single Phase Overhaul**: This involves converting the entire backend to TypeScript in one go. It's the most straightforward approach but can be disruptive, especially for larger codebases.
      
      - **Incremental Transition**: Convert parts of the backend progressively. This can be done by:
         - Maintaining a separate directory for TypeScript files.
         - Gradually migrating and testing individual modules or routes.
         - Using a build tool like `tsc` to compile TypeScript files independently until the entire transition is complete.
         
   - **Compilation Considerations**: 
      - Introducing a compilation step for the server is an option. This would involve using tools like `ts-node` for development and `tsc` for production builds.
      - However, this is not a conventional approach for Express.js servers and could introduce added complexity, especially in terms of build and deployment processes.
      
   - **Current Stance**: At present, this backend transition is of lower priority and might not be pursued.

## 7. Module Import Conventions

- `npm` packages first, 
     - from shortest line (top) to longest (bottom)

- Followed by typescript types (pertains to data-provider and client workspaces)
     - longest line (top) to shortest (bottom)
     - types from package come first

- Lastly, local imports
     - longest line (top) to shortest (bottom)
     - imports with alias `~` treated the same as relative import with respect to line length

---

Please ensure that you adapt this summary to fit the specific context and nuances of your project.

---

## [Go Back to ReadMe](../README.md)
