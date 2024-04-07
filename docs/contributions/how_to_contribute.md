---
title: 🙌 Getting Started for Contributors
description: Learn how to use GitHub Desktop, VS Code extensions, and Git rebase to contribute in a quick and easy way.
weight: -10
---

# Getting Started for Contributors
!!! danger "Important:"
      - 📚 If you're new to concepts like **repositories**, **pull requests (PRs)**, **forks**, and **branches**, begin with the official GitHub documentation:
        - [Getting Started - About Collaborative Development Models](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/about-collaborative-development-models)
      - 🌐 For contributing translations, refer to: 
        - [Contribute a Translation](./translation_contribution.md)
      - 💻 To understand our coding standards, see: 
        - [Coding Conventions](./coding_conventions.md)
      - 👥 Our contributor guidelines can be found at: 
        - [Contributor Guidelines](https://github.com/danny-avila/LibreChat/blob/main/.github/CONTRIBUTING.md)
      - 📝 For updates and additions to documentation, please review: 
        - [Documentation Guidelines](./documentation_guidelines.md)
      - 🧪 Consult the following guide to perform local tests before submitting a PR: 
        - [Local Test Guide](./testing.md) 

## Requirements

1. ✅ [Git](https://git-scm.com/downloads) - ^^Essential^^
2. ✅ [Node.js](https://nodejs.org/en/download) - ^^Essential^^, use the LTS version
3. ✅ [Git LFS](https://git-lfs.com/) - ^^Useful^^ for uploading files with larger sizes.
4. ✅ [Github Desktop](https://desktop.github.com/) - ^^Optional^^
5. ✨ [VSCode](https://code.visualstudio.com/Download) - ^^Recommended^^ Source-code Editor
6. 🐳 [Docker Desktop](https://www.docker.com/products/docker-desktop/) - ^^Recommended^^ (more on that later)

### Recommended VSCode extensions

It is recommended to install the following extensions in VS Code:

- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens)

## Prepare the Environment

??? question "npm vs Docker"

      While Docker is our preferred method for installing LibreChat due to its ease of setting up and consistency across different environments, we strongly recommend using npm for development purposes. This recommendation is based on several advantages that npm offers for developers:

      - Faster Iteration: npm allows for quicker iteration cycles during development. Changes made to the codebase can be immediately reflected without the need to rebuild the entire Docker image, leading to a more efficient development process.
      - Direct Dependency Management: Using npm gives developers direct control over the dependencies. It’s easier to install, update, or remove packages, and manage project dependencies in real-time, which is crucial for development.
      - Simplified Debugging: Debugging is more straightforward with npm, as developers can directly interact with the code and tools without the abstraction layer that Docker introduces. This direct interaction facilitates easier identification and resolution of issues.
      - Native Environment: Developing with npm allows the application to run in its native environment on your machine. This can help in catching environment-specific issues early in the development cycle.

      For these reasons, while Docker remains the recommended installation method for production and distribution due to its containerization benefits, npm is the preferred choice for development within the LibreChat ecosystem.

### GitHub

- Fork the LibreChat repository: [https://github.com/danny-avila/LibreChat/fork](https://github.com/danny-avila/LibreChat/fork)

- Create a branch on your fork, give it a proper name and point it to the original repository
??? info "Screenshots:"
    ![image](https://github.com/danny-avila/LibreChat/assets/32828263/c4cff4d5-70ea-4263-9156-e7f220e049eb)
    ![image](https://github.com/danny-avila/LibreChat/assets/32828263/8ec85f02-f0f7-4cef-bb1c-6ff1bd1d7023)
    ![image](https://github.com/danny-avila/LibreChat/assets/32828263/09e4ea5c-0753-470d-a0c5-8281a523a81b)

- Download your new branch on your local pc

!!! quote ""

    ```sh title="Download your LibreChat branch"
    git clone -b branch-name https://github.com/username/LibreChat.git
    ```
      
    !!! warning "note:"
        replace `branch-name` and `username` with your own

### Open it in VS Code
- Once you successfully cloned your branch
  - Navigate to the LibreChat folder: 
  ```sh
  cd LibreChat
  ```
  - Open it in VS Code:
  ```sh
  code .
  ```

### Prepare LibreChat

- Open the terminal in vscode with ++ctrl+shift+grave++
    - Alternatively you can use ++ctrl+j++ to open the bottom pane and select the terminal from there 

- Install the LibreChat depencencies
    - ```
      npm ci
      ```
    - ```
      npm run frontend
      ```
- .env Configuration
    - Create the ==.env== file. If you dont have one handy, you can duplicate the ==.env.example== file and configure it. 

!!! warning ".env"
    The default values in the example file should be fine, except for `MONGO_URI`. You will need to provide your own. You can use [MongoDB Community Server](https://www.mongodb.com/try/download/community), [MongoDB Atlas Cloud](https://www.mongodb.com/cloud/atlas/register), see this doc to setup Mongodb Atlas Cloud: [Online MongoDB](../install/configuration/mongodb.md).

    You can also enable verbose server output in the console with `DEBUG_CONSOLE` set to true.   

### Development Workflow

To efficiently work on LibreChat, use the following commands:

- **Starting the Backend:**
    - Use `npm run backend` to start LibreChat normally.
    - For active development, `npm run backend:dev` will monitor backend changes.
    - Access the running application at `http://localhost:3080/`.

- **Running the Frontend in Development Mode:**
    - ❗**Ensure the backend is also running.**
    - Execute `npm run frontend:dev` to actively monitor frontend changes.
    - View the frontend in development mode at `http://localhost:3090/`.

!!! tip "Pro Tip:"
    To avoid the hassle of restarting both frontend and backend during frontend development, simply run `npm run frontend:dev` for real-time updates on port 3090.

## Perform Tests Locally
Before submitting your updates, it’s crucial to verify they pass all tests. Follow these steps to run tests locally, see: [Perform Tests Locally](./testing.md)

By running these tests, you can ensure your contributions are robust and ready for integration.

## Commit, Push, Pull Request (PR)

### Make a Commit

**Commits** should be made when you reach a logical checkpoint in your development process. This could be after a new feature is added, a bug is fixed, or a set of related changes is completed. Each commit should contain a clear message that explains what changes have been made and why.

**Example:**
```bash
git add .
git commit -m "Add login functionality"
```

### Push Changes

You should **push** your changes to the remote repository after a series of commits that complete a feature or fix a known issue. Pushing often helps to ensure that your changes are safely stored remotely and makes collaboration with others easier.

**Example:**
```bash
git push origin feature-branch-name
```

### Make a Pull Request (PR)

A **Pull Request** should be made when you want to merge your changes from a feature branch into the main branch. Before creating a PR, make sure to:

1. Pull the latest changes from the main branch and resolve any conflicts.
2. Push your updated feature branch.
3. Ensure your code adheres to the project's style and contribution guidelines.

**Example:**
```bash
git checkout main
git pull origin main
git checkout feature-branch-name
git merge main
# Resolve conflicts if any
git push origin feature-branch-name
# Now go to GitHub and open a pull request
```
When you are ready, open your repository in a browser and click on "Contribute"
![image](https://github.com/danny-avila/LibreChat/assets/32828263/4da0a287-e6d3-4e75-af6b-4cffc28f593c)

!!! info "Note:"
    Remember to provide a detailed description in your PR that explains the changes and the value they add to the project. It's also good practice to reference any related issues.

!!! tip
    You can use GitHub Desktop to monitor what you've changed.
      ![image](https://github.com/Berry-13/LibreChat/assets/81851188/a04a7e81-7c75-4c77-8463-d35f603bedf7)

!!! warning
    If `git commit` fails due to ESLint errors, read the error message and understand what's wrong. It could be an unused variable or other issues.

## Reverting Commits Safely

If you need to undo changes in your feature branch, proceed with caution. This guide is for situations where you have commits that need to be removed and there are no open Pull Requests (PRs) or ongoing work on the branch.

!!! danger "Warning"
    Force pushing can rewrite history and potentially disrupt the workflow for others. Use this method only as a last resort.

1. Update your local repository with the latest changes from the feature branch:
   ```bash
   git pull origin feature-branch-name
   ```
2. Review the commit history to determine how many commits to revert:
   ```bash
   git log
   ```
3. Start an interactive rebase session for the last `N` commits you wish to revert:
   ```bash
   git rebase -i HEAD~N
   ```
   Replace `N` with the number of commits you want to go back, such as `2` for two commits or `100` for a hundred.

4. In the interactive editor, replace `pick` with `drop` for the commits you want to remove. Then save and exit the editor (usually with ++esc++ followed by typing `:wq`).

5. Force push the changes to the remote repository:
   ```bash
   git push --force origin feature-branch-name
   ```
