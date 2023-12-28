---
title: 🙌 Beginner's Guide to Contributions
description: Learn how to use GitHub Desktop, VS Code extensions, and Git rebase to contribute in a quick and easy way.
weight: -10
---
# How to Contribute in a Quick and Easy Way
> **❗Note:** If you are not familiar with the concept of repo, PR (pull request), fork and branch, start by looking at the official GitHub documentation on the subject:
[https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/about-collaborative-development-models](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/about-collaborative-development-models)

## Installation of Tools

1. [Git](https://git-scm.com/downloads) is essential, the first thing to download.
2. [Git LFS](https://git-lfs.com/) can be useful for uploading files with larger sizes.
3. [Github Desktop](https://desktop.github.com/) - I use it only for UI; I don't recommend using it for pushing or other actions.

## How to Use?

This will be a somewhat raw text, but I'll try to be as clear as possible.

I recommend installing the following extensions in VS Code:

- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)

### Example of a Pull Request (PR)

Let's say I want to add another page for an API Panel.

1. Open GitHub and select Danny's fork.
2. First, make sure that the main branch is clean with no commits and up to date.
   ![image](https://github.com/Berry-13/LibreChat/assets/81851188/4d627ee7-0f59-458f-8723-4f0eae447dd9)
3. Open "View all my branches" and create a new branch with a descriptive name for your task. For example: "ApiPanel."
4. In GitHub Desktop, select the branch you just created.
   ![image](https://github.com/Berry-13/LibreChat/assets/81851188/dd4374b8-419a-4406-97a3-999ba4118397)
5. Start modifying the code, and when you finish a part, commit the changes.
Example of commits:
- commit1: Created the frontend
- commit2: Fixed a bug in variable export
- commit3: Removed unnecessary comments and added translation support
- and so on...

## Testing

While testing the code, if you're working with the frontend, it might be frustrating to run `npm run frontend` and `npm run backend` every time. Instead, use `npm run frontend:dev` to see real-time changes on port 3090 (really!).

> Note: You must run `npm run frontend` once before you can use `npm run frontend:dev`

### How?

- `git add *` adds all files to be committed.
- `git commit -m "name-of-your-commit"` creates a commit.
- `git push` uploads the changes.

Before doing all this, I recommend using GitHub Desktop to see what you've changed.
   ![image](https://github.com/Berry-13/LibreChat/assets/81851188/a04a7e81-7c75-4c77-8463-d35f603bedf7)

If `git commit` fails due to ESLint errors, read the error message and understand what's wrong. It could be an unused variable or other issues.

### Possible Various Problems

If you have the main branch with many commits and don't know what to do, follow this simple guide:

⚠️ Please do this only when you have no active PRs or when you're not working on the project:

1. Do a pull origin and in the terminal write `git log` to identify how many commits you are behind.
2. Use `git rebase -i HEAD~2`, where 2 represents the number of commits you need to go back. If you need to go back 100 commits, use `git rebase -i HEAD~100`.
3. In the editor, change the "pick" for the two commits to "drop," save with "esc," then type `:wq` and press "Enter."
4. Finally, run `git push --force origin main`.
