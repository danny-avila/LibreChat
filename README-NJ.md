# LibreChat for New Jersey

A LibreChat fork with customizations for the state of New Jersey.

## Local Development

There are developer instructions in `.github/CONTRIBUTING.md`, however we've found better methods for local dev.

### Initial Setup

You *should* only need to do the following once:

1. Install [Docker CLI](https://github.com/docker/cli), [Colima](https://github.com/abiosoft/colima), and 
   [Docker Compose](https://github.com/docker/compose) (note: Docker Desktop NOT allowed at NJ). The following
   terminal commands will install all three (make sure [homebrew](https://brew.sh/) is installed)
   ```
   $ brew install colima docker docker-compose
   $ mkdir ~/.docker
   $ cat >~/.docker/config.json <<EOF
       "cliPluginsExtraDirs": [
         "/opt/homebrew/lib/docker/cli-plugins"
       ]
     EOF
   $ brew services start colima
   ```
2. Install `nvm` ([instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)).
3. Setup Node v20
   - `$ nvm install 20` (first time only) 
   - `$ nvm use 20`
4. Install TypeScript globally
   - `$ npm i -g typescript`
5. Use docker to run services (e.g. Mongo)
   - `$ docker compose -f nj/dev-docker-compose.yml up -d`
6. Create a local copy of `.env` and `librechat.yaml`
   - `$ cp .env.example .env`
   - `$ cp librechat.example.yaml librechat.yaml`
7. Configure `.env` and `librechat.yaml` to connect to our AIs
   - *TODO: Set up a good system for sharing these settings, for now just ask over Slack.* 

### Building & Running LibreChat

Repeatable steps for getting LibreChat going:

1. Build everything
   - `$ npm run reinstall`
2. Start the backend (w/ live rebuilds)
   - `$ npm run backend:dev`
3. Start the frontend (w/ live rebuilds)
   - `$ npm run frontend:dev`
4. Visit LibreChat @ http://localhost:3090

NOTE: `reinstall` builds all the code in `/packages/`, but does not do live rebuilds.  If you want live coding for 
`/packages`, you'll need to run `build:watch` in their respective directories:
`$ npm run build:watch --prefix packages/[directory]`

## How to Work in This Repo

### Minimize Upstream Conflicts

While we want to customize the AI experience for New Jersey, we also want to leverage the work from the LibreChat OSS 
community as well.

In order to be able to continue merging upstream LibreChat changes, we need to minimize merge conflict potential:

- **Contribute changes to LibreChat if possible.** If the change is fixing a bug (such as an accessibility issue), then
  merge it directly into LibreChat (both to give back & to minimize our customizations).

- **When adding new code, keep most of the code in a separate NJ-specific file instead of adding the logic inline.**
  E.g., if you want to add some new elements to a page, wrap them in a separate React Component, and just import the 
  Component into the existing file.

- **When removing LibreChat features, find the highest-impact inflection point and comment out the code there.**
  E.g., if there's a setting we want to hide from users, just comment out the component instead of removing the setting
  from the app altogether.

- **Leave comments on modifications to guide anyone needing to handle a merge conflict at that point.** 

### Branching Strategy

We use trunk-based development with a focus on merging changes from upstream. As such, we have two branches:

`main` - mirrors [`LibreChat/main`](https://github.com/danny-avila/LibreChat/tree/main)

`prod` - where our version of LibreChat lives & deploys from

Here's the basic processes:

**Contributing code** - Create a pull request; once finished, squash & rebase it onto `prod`.

**Upstream merges** - Push LibreChat's `main` onto our `main`, then create a merge commit on `prod`. 
Be sure to smoke test before merging!

**Pushing to prod** - *Exact process TBD (but will involve tagging commits on `prod`)* 
