# LibreChat for New Jersey

A LibreChat fork with customizations for the state of New Jersey.

## Local Development

There are developer instructions in `.github/CONTRIBUTING.md`, however we've found better methods for local dev.

### Initial Setup

You _should_ only need to do the following once:

1. Install [Docker CLI](https://github.com/docker/cli), [Colima](https://github.com/abiosoft/colima), and
   [Docker Compose](https://github.com/docker/compose).
   - _**Note:** Docker Desktop NOT allowed at NJ._

   The following terminal commands will install all three (make sure [Homebrew](https://brew.sh/) is installed)

   ```bash
   # Install dependencies
   $ brew install colima docker docker-compose

   # Create Docker config directory
   $ mkdir ~/.docker

   # Write config.json
   $ cat > ~/.docker/config.json <<EOF
   {
   "cliPluginsExtraDirs": [
    "/opt/homebrew/lib/docker/cli-plugins"
   ]
   }
   EOF

   # Start Colima
   $ brew services start colima
   ```

2. Install `nvm` ([instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)).
3. Setup Node v20
   - `$ nvm install 20` (first time only)
   - `$ nvm use 20`
4. Install TypeScript globally
   - `$ npm i -g typescript`
5. Use docker to run services (e.g. Mongo)
   - `$ docker compose -f nj-dev-docker-compose.yml up -d`
6. Create a `.env` file in the root directory & fill it with our `.env` from Bitwarden.

### Building & Running LibreChat

Repeatable steps for getting LibreChat going:

1. Build everything
   - `$ npm run reinstall`
2. Start the backend (w/ live rebuilds)
   - `$ npm run backend:dev`
3. Start the frontend (w/ live rebuilds)
   - `$ npm run frontend:dev`
4. Visit LibreChat @ http://localhost:3090

NOTE: `reinstall` builds all the code in `/packages/`, but does not do live rebuilds. If you want live coding for
`/packages`, you'll need to run `build:watch` in their respective directories:
`$ npm run build:watch --prefix packages/[directory]`

### Running e2e tests

Our tests live in: ./nj/e2e/* and they can be run on their own with the following command:

1. Build everything
   - `$ npm run reinstall`
2. Run the tests
   - `npm run e2e:nj`

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

`newjersey` - where our version of LibreChat lives & deploys from

Here's the basic processes:

**Contributing code** - Create a pull request; once finished, squash & rebase it onto `newjersey`.

**Upstream merges** - Push LibreChat's `main` onto our `main`, then create a merge commit on `newjersey`.
Be sure to smoke test before merging!

## Merging Upstream Changes

We want to keep our repository up-to-date with the latest changes
from [upstream](https://github.com/danny-avila/LibreChat/tree/main).

To that end, we have a weekly
action ([Sync Upstream LibreChat](https://github.com/newjersey/LibreChat/actions/workflows/nj-sync-upstream.yml)) which
should fire each Wednesday. The action itself includes instructions on how to handle merge conflicts etc., but make sure
to actually pay attention to the pull request it generates each week!

## Releasing to Prod

Prod release happens in two steps:

1. Create a [release](https://github.com/newjersey/LibreChat/releases) in Github, and wait for it to build and push
2. [OPTIONAL] If environment variables have changed, run the [render-env workflow](./.github/workflows/render-env.yml) 
3. Run the [infra deploy workflow](./.github/workflows/nj-infra-deploy.yml) on the prod environment.

### Create a new release

Go to [releases](https://github.com/newjersey/LibreChat/releases) and click "Draft new release."

In the Select Tag dropdown, press Create New Tag. Format the new tag like `release-YYYYMMDD.X`. (The `.X` is an optional increment in case multiple tags are cut per day.)

Target the `newjersey` branch.

The Release Title should be the same as the new tag.

The auto-select previous tag is fairly reliable, but you can manually set to the last tag if needed. Click "generate release notes" to automatically generate some decent notes.

Keep "Set as the latest release" selected.

Then click "Publish release."

The new release & tag will initiate the tag build and update the `ai-assistant/prod-image-tag` SSM parameter.

### Updating Environment Files
Environment files are rendered and uploaded by [this workflow](./.github/workflows/render-env.yml). It takes [the nj template](./nj/nj.env.template) and performs `envsubst`, pulling in values from Github environment secrets. TechOps support will likely be needed to update those environment secrets, but Josh can do it for right now.

If either the template or the secret values have been updated, you can update the env vars by:

1. Navigate to the Actions tab in the repo
2. Select "Render and upload env file"
3. Select "Run Workflow" and select your target environment
4. The workflow will get the environment-specific values from secrets, perform `envsubst`, upload the file to S3, and redeploy the service. 

#### Manually set release tag for prod (Rollback Strategy, DANGER)
In the event that we need to set prod to a specific release tag, we can run the `Set prod release tag` workflow in Github Actions. This takes a text input for the release tag, and includes a verification step to ensure we're not setting a non-existent tag. The infra deploy workflow will still need to be ran to deploy the new tag.

### Run the infra deploy workflow

- From the Github Actions tab, select the Deploy AI Assistant Infrastructure workflow
- Select Run Workflow
  - Branch: `newjersey`
  - Environment: `prod`
- Wait for the cdk-diff job to complete
- REVIEW THE OUTPUT. When you approve the cdk-deploy job, you are responsible for the changes that roll out.
- Approve and wait for the fireworks. You can watch the deployment from the Cloudformation console if so desired.

## ClickOps Components

The following components of the NJ AI Assistant are managed via ClickOps (manually):
- The Bedrock Guardrails
- A Secrets Manager secret that stores the connection string between the prod LibreChat container and DocumentDB. 

The remaining infrastructure is deployed by CDK.

### Updating Bedrock Guardrail
Guardrail configs are managed per-environment through the AWS console. To manage them:
1. Log into the desired AWS account
2. Navigate to Bedrock -> Guardrails
3. Select "Working Draft"
4. Perform updates
5. Select "Publish Version"
6. Note the latest version number
7. In GitHub, go to Environment -> <env_to_change> -> Secrets
8. Change `GUARDRAIL_VERSION`, supply the new value
9. Run the steps for `Updating Environment Files` above.

### Secrets Manager Connection String

The connection string for DocumentDB lives in AWS Secrets Manager under the name `ai-assistant/docdb/uri`. If the DocumentDB secret is rotated, it must be updated here for LibreChat to maintain connection.

## Updating the New Updates widget
The purpose of this widget is surfacing new updates and changes to the user. Information can be updated in `client/src/nj/components/NewUpdatesWidget.tsx`, and the env var `VITE_DISPLAY_UPDATE_WIDGET` must be set to `true`. 
