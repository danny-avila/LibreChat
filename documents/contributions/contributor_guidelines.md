# Contributor Guidelines

Thank you to all the contributors who have helped make this project possible! We welcome various types of contributions, 
such as bug reports, documentation improvements, feature requests, and code contributions.

## Contributing Guidelines

If the feature you would like to contribute has not already received prior approval from the project maintainers (ie. the feature is currently on the roadmap or on the [trello board]()), please submit a proposal in the [proposals category](https://github.com/danny-avila/chatgpt-clone/discussions/categories/proposals) of the discussions board before beginning work on it. 
- Proposals should include specific implementation details including areas of the application that will be effected by the change inlcuding designs if applicable, and any other relevant information that might be required for a speedy review.
- Proposals are not required for small changes, bug fixes, or documentation improvements. 
- Small changes and bug fixes should be tied to an [issue](https://github.com/danny-avila/chatgpt-clone/issues) and included in the corresponding pull request for tracking purposes. 
 
*Please note that a pull request involving a feature that has not been reviewed and approved by the project maintainers may be rejected.*

If you would like to discuss the changes you wish to make, join our [Discord community](https://discord.gg/NGaa9RPCft).

## Our Standards

Please read our [Coding Standards and Conventions](coding_conventions.md) before beginning on a contribution.

Examples of behavior that contributes to creating a positive environment
include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

Project maintainers have the right and responsibility to remove, edit, or reject comments, commits, code, wiki edits, issues, and other contributions when necessary. 

## To contribute to this project, please adhere to the following guidelines:

## 1. Git Workflow

We use a GitFlow workflow to manage changes to this project's codebase. Follow these general steps when contributing code:

1. Fork the repository and create a new branch with a descriptive slash based name (e.g., new/feature/x).
2. Implement your changes and ensure that all tests pass.
3. Commit your changes using conventional commit messages with GitFlow flags. Begin the commit message with a tag indicating the change type, such as "feat" (new feature), "fix" (bug fix), "docs" (documentation), or "refactor" (code refactoring), followed by a brief summary of the changes (e.g., `feat: Add new feature X to the project`).
4. Submit a pull request with a clear and concise description of your changes and the reasons behind them.
5. We will review your pull request, provide feedback as needed, and eventually merge the approved changes into the main branch.

## 2. Commit Message Format

We have very precise rules over how our Git commit messages must be formatted.
This format leads to **easier to read commit history**.

Each commit message consists of a **header**, a **body**, and a **footer**.


```
<header>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The `header` is mandatory and must conform to the [Commit Message Header](#commit-header) format.

The `body` is mandatory for all commits except for those of type "docs".
When the body is present it must be at least 20 characters long and must conform to the [Commit Message Body](#commit-body) format.

The `footer` is optional. The [Commit Message Footer](#commit-footer) format describes what the footer is used for and the structure it must have.


#### <a name="commit-header"></a>Commit Message Header

```
<type>(<scope>): <short summary>
  │       │             │
  │       │             └─⫸ Summary in present tense. Not capitalized. No period at the end.
  │       │
  │       └─⫸ Commit Scope: common|plays (2048, analog-clock, basic-calculator, etc.)|infra|etc.
  │
  └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
```

The `<type>` and `<summary>` fields are mandatory, the `(<scope>)` field is optional.


##### Type

Must be one of the following:

* **build**: Changes that affect the build system or external dependencies
* **ci**: Changes to our CI configuration files and script
* **docs**: Documentation only changes
* **feat**: A new feature
* **fix**: A bug fix
* **perf**: A code change that improves performance
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **test**: Adding missing tests or correcting existing tests


##### Summary

Use the summary field to provide a succinct description of the change:

* use the imperative, present tense: "change" not "changed" nor "changes"
* don't capitalize the first letter
* no dot (.) at the end


#### <a name="commit-body"></a>Commit Message Body

Just as in the summary, use the imperative, present tense: "fix" not "fixed" nor "fixes".

Explain the motivation for the change in the commit message body. This commit message should explain _why_ you are making the change.
You can include a comparison of the previous behavior with the new behavior in order to illustrate the impact of the change.


#### <a name="commit-footer"></a>Commit Message Footer

The footer can contain information about breaking changes and deprecations and is also the place to reference GitHub issues, Jira tickets, and other PRs that this commit closes or is related to.
For example:

```
BREAKING CHANGE: <breaking change summary>
<BLANK LINE>
<breaking change description + migration instructions>
<BLANK LINE>
<BLANK LINE>
Fixes #<issue number>
```

or

```
DEPRECATED: <what is deprecated>
<BLANK LINE>
<deprecation description + recommended update path>
<BLANK LINE>
<BLANK LINE>
Closes #<pr number>
```

Breaking Change section should start with the phrase "BREAKING CHANGE: " followed by a summary of the breaking change, a blank line, and a detailed description of the breaking change that also includes migration instructions.

Similarly, a Deprecation section should start with "DEPRECATED: " followed by a short description of what is deprecated, a blank line, and a detailed description of the deprecation that also mentions the recommended update path.


### Revert commits

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit.

The content of the commit message body should contain:

- information about the SHA of the commit being reverted in the following format: `This reverts commit <SHA>`,
- a clear description of the reason for reverting the commit message.

Each commit message should start with a tag indicating the change type and a brief summary of the changes. This format enables quick identification of each commit's purpose and can be used to generate changelogs.

## 3. Pull Request Process


### Note: Submit a pull request with a clear and concise description of your changes and the reasons behind them. Be sure to include the steps to test the PR.

1. Ensure any install or build dependencies are removed before the end of the layer when doing a
   build.
2. Update the README.md with details of changes to the interface, this includes new environment
   variables, exposed ports, useful file locations and container parameters.
3. Increase the version numbers in any examples files and the README.md to the new version that this
   Pull Request would represent. The versioning scheme we use is [SemVer](http://semver.org/).

Ensure that your changes meet the following criteria when submitting a pull request:
- All tests pass.
- The code is well-formatted and adheres to our coding standards.
- The commit history is clean and easy to follow. (Use Squash to clean your commit history)
- The pull request description clearly outlines the changes and the reasons behind them.

## 4. Naming Conventions

Apply the following naming conventions to branches, labels, and other Git-related entities:

- Branch names: descriptive and slash based (e.g., new/feature/x)
- Labels: descriptive and snake_case (e.g., `bug_fix`).
- Directories and file names: descriptive and snake_case (e.g., `config_file.yaml`).

##

## [Go Back to ReadMe](../../README.md)


