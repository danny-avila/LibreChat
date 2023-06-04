# Contributor Guidelines

Thank you to all the contributors who have helped make this project possible! We welcome various types of contributions, such as bug reports, documentation improvements, feature requests, and code contributions.

## Contributing Guidelines

If the feature you would like to contribute has not already received prior approval from the project maintainers (i.e., the feature is currently on the roadmap or on the [Trello board]()), please submit a proposal in the [proposals category](https://github.com/danny-avila/chatgpt-clone/discussions/categories/proposals) of the discussions board before beginning work on it. The proposals should include specific implementation details, including areas of the application that will be affected by the change (including designs if applicable), and any other relevant information that might be required for a speedy review. However, proposals are not required for small changes, bug fixes, or documentation improvements. Small changes and bug fixes should be tied to an [issue](https://github.com/danny-avila/chatgpt-clone/issues) and included in the corresponding pull request for tracking purposes.

Please note that a pull request involving a feature that has not been reviewed and approved by the project maintainers may be rejected. We appreciate your understanding and cooperation.

If you would like to discuss the changes you wish to make, join our [Discord community](https://discord.gg/uDyZ5Tzhct), where you can engage with other contributors and seek guidance from the community.

## Our Standards

We strive to maintain a positive and inclusive environment within our project community. We expect all contributors to adhere to the following standards:

- Using welcoming and inclusive language.
- Being respectful of differing viewpoints and experiences.
- Gracefully accepting constructive criticism.
- Focusing on what is best for the community.
- Showing empathy towards other community members.

Project maintainers have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions that do not align with these standards.

## To contribute to this project, please adhere to the following guidelines:

## 1. Git Workflow

We utilize a GitFlow workflow to manage changes to this project's codebase. Follow these general steps when contributing code:

1. Fork the repository and create a new branch with a descriptive slash-based name (e.g., `new/feature/x`).
2. Implement your changes and ensure that all tests pass.
3. Commit your changes using conventional commit messages with GitFlow flags. Begin the commit message with a tag indicating the change type, such as "feat" (new feature), "fix" (bug fix), "docs" (documentation), or "refactor" (code refactoring), followed by a brief summary of the changes (e.g., `feat: Add new feature X to the project`).
4. Submit a pull request with a clear and concise description of your changes and the reasons behind them.
5. We will review your pull request, provide feedback as needed, and eventually merge the approved changes into the main branch.

## 2. Commit Message Format

We have defined precise rules for formatting our Git commit messages. This format leads to an easier-to-read commit history. Each commit message consists of a header, a body, and an optional footer.

### Commit Message Header

The header is mandatory and must conform to the following format:

```
<type>(<scope>): <short summary>
```

- `<type>`: Must be one of the following:
  - **build**: Changes that affect the build system or external dependencies.
  - **ci**: Changes to our CI configuration files and script.
  - **docs**: Documentation-only changes.
  - **feat**: A new feature.
  - **fix**: A bug

 fix.
  - **perf**: A code change that improves performance.
  - **refactor**: A code change that neither fixes a bug nor adds a feature.
  - **test**: Adding missing tests or correcting existing tests.

- `<scope>`: Optional. Indicates the scope of the commit, such as `common`, `plays`, `infra`, etc.

- `<short summary>`: A brief, concise summary of the change in the present tense. It should not be capitalized and should not end with a period.

### Commit Message Body

The body is mandatory for all commits except for those of type "docs". When the body is present, it must be at least 20 characters long and should explain the motivation behind the change. You can include a comparison of the previous behavior with the new behavior to illustrate the impact of the change.

### Commit Message Footer

The footer is optional and can contain information about breaking changes, deprecations, and references to related GitHub issues, Jira tickets, or other pull requests. For example, you can include a "BREAKING CHANGE" section that describes a breaking change along with migration instructions. Additionally, you can include a "Closes" section to reference the issue or pull request that this commit closes or is related to.

### Revert commits

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. The commit message body should include the SHA of the commit being reverted and a clear description of the reason for reverting the commit.

## 3. Pull Request Process

When submitting a pull request, please follow these guidelines:

- Ensure that any installation or build dependencies are removed before the end of the layer when doing a build.
- Update the README.md with details of changes to the interface, including new environment variables, exposed ports, useful file locations, and container parameters.
- Increase the version numbers in any example files and the README.md to reflect the new version that the pull request represents. We use [SemVer](http://semver.org/) for versioning.

Ensure that your changes meet the following criteria:

- All tests pass.
- The code is well-formatted and adheres to our coding standards.
- The commit history is clean and easy to follow. You can use `git rebase` or `git merge --squash` to clean your commit history before submitting the pull request.
- The pull request description clearly outlines the changes and the reasons behind them. Be sure to include the steps to test the pull request.

## 4. Naming Conventions

Apply the following naming conventions to branches, labels, and other Git-related entities:

- Branch names: Descriptive and slash-based (e.g., `new/feature/x`).
- Labels: Descriptive and snake_case (e.g., `bug_fix`).
- Directories and file names: Descriptive and snake_case (e.g., `config_file.yaml`).

## Go Back to ReadMe

[Go Back to ReadMe](README.md)
