# New Jersey AI Assistant (NJ AIA)

A fork of LibreChat's open-source AI platform, with customizations for the state of New Jersey.

## New Team Member Onboarding

If you are new team member joining the NJ AI Assistant (AIA) project, start with this
document: [[NJ AI Assistant] Onboarding](https://docs.google.com/document/d/1QIkGi_mpq35wE7yarwtQ9jd286PJqANsgRULIwgMJK0/edit?tab=t.0#heading=h.j23ek77dt9h5).

## Local Development

There are developer instructions in `.github/CONTRIBUTING.md`, however we've found better methods for local dev.

### Container Setup

You _should_ only need to do the following once:

1. Install [Docker CLI](https://github.com/docker/cli), [Colima](https://github.com/abiosoft/colima), and
   [Docker Compose](https://github.com/docker/compose). _Docker Desktop is NOT allowed at NJ._

   <details>
   <summary>Setup commands</summary>

   Make sure [Homebrew](https://brew.sh/) is installed first.

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
   </details>

2. Install `nvm` ([instructions](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)).
3. Setup Node: `nvm use`
4. Install TypeScript globally: `npm i -g typescript`

Once you've finished initial setup, you can start (or restart) containers using this command:

```
docker compose -f nj-dev-docker-compose.yml up -d
````

### Building & Running NJ AIA (AIA)

Before running AIA, first create a `.env` file in the root directory & fill it with our `.env` from Bitwarden.

Afterwards, you can repeat these steps to get AIA running:

1. Build everything: `npm run reinstall`
    - _Note: after running this once, you can instead run `npm run frontend` to build w/o reinstalling node_modules to
      save time, if you know packages haven't changed._
2. Start the backend (w/ live rebuilds): `npm run backend:dev`
3. Start the frontend (w/ live rebuilds): `npm run frontend:dev`
4. Visit AIA @ http://localhost:3090

NOTE: `reinstall`/`frontend` builds all the code in `/packages/`, but does not do live rebuilds. If you want live coding
for
`/packages`, you'll need to run `build:watch` in their respective directories as so:
`npm run build:watch --prefix packages/[directory]`

### Building & Running Agents Library

Most of LibreChat is contained within this repo, but some functionality (such as agent tools) is located in a
separate [agents repository](https://github.com/danny-avila/agents).

If you're developing in the `agents` repository and want to test it here, you can use the
[`npm link`](https://docs.npmjs.com/cli/v8/commands/npm-link) tool. Essentially, it puts a symlink to the package in
your local global node_modules folder, which other projects can access via `npm link`.

There are three steps to setting it up:

1. Run `npm link` in the `agents` repo.
2. Run `npm link @librechat/agents` in the `LibreChat` repo.
3. Run `npm run build:dev` in the `agents` repo (every time you want to test new code).

To go back to normal, run `npm run reinstall`, which resets `node_modules`.

### Running E2E tests

Our E2E tests live in `./nj/e2e/\*` and can be run on their own with the following command:

1. Build everything: `npm run reinstall`
2. Run the tests: `npm run e2e:nj`

## How to Work in This Repo

### Spelunking LibreChat

AI Assistant is a fork of LibreChat, which at times is an intimidatingly large project.

Here are some tips for navigating such a large repository:

- The repo is compartmentalized into different modules. Focus on just one module at a time to avoid getting lost.
- It is often easiest to find a React component either by searching for any visible text. The second easiest way is to
  inspect the component then look for its CSS classes; that often narrows it down to just a handful of possible
  components.
- Use a debugger to walk through how the code works. A debugger can be used both on the backend and frontend.
- AI can be good at analyzing code paths. If you're curious how a feature works, ask AI to walk you through it.

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

We use trunk-based development with a focus on merging changes from upstream. We have one branch, `newjersey`,
which is where our NJ AIA lives & deploys from. Releases are done via tagging commits on the `newjersey`
branch.

### Pull Requests

Changes should use pull requests targeting `newjersey`, with squash & rebase as the merge method.

Keep in mind that, by default, GitHub opens pull requests targeting upstream (NOT our repo). Make sure to change all PRs
so they target New Jersey's fork.

### Merging Upstream Changes

We want to keep our repository up-to-date with the latest changes
from [upstream](https://github.com/danny-avila/LibreChat/tree/main).

To that end, we have a weekly
action ([Sync Upstream LibreChat](https://github.com/newjersey/nj-ai-assistant/actions/workflows/nj-sync-upstream.yml))
which should fire each Wednesday. The action itself includes instructions on how to handle merge conflicts etc., but
make sure to actually pay attention to the pull request it generates each week!

Here are some tips on successfully merging from upstream:

- Always resolve merge conflicts first - CI is gonna fail until all those are resolved.
- Most of our CI is based on their CI scripts, so if CI is still failing after resolving merge conflicts, look into the
  workflow scripts to see if anything changed there.
- Whenever upstream adds new features, check in with product to see if we want to adopt them or not. (It's okay to merge
  them as long as we have a plan to remove them if we don't want them before the next release.)

### Contributing Upstream

Sometimes, we make changes that would benefit any user of LibreChat (such as fixing core bugs or adding
general-use features). In those cases, we should strive to contribute these changes back upstream (to LibreChat itself).
Not only is it good to give back, but it also makes our lives easier in the long run (as there's no future merge
conflicts from code we contribute).

Make sure to read `CONTRIBUTING.md` for details on how to properly format commits etc. for upstream contributions.

Depending on the urgency of the change, there are two strategies you can use for contribution:

1. **Contribute upstream, then later merge into our repo (preferred)**: this relies on the weekly upstream merge to
   capture our change. It's preferred because 1. you only need to make one PR and 2. if any changes are required for
   acceptance into upstream, they're handled before they get to our repo, minimizing merge conflicts.
2. **Simultaneously merge into our repo while contribution upstream**: if a change is needed ASAP in our repo, then we
   have no choice but to do it twice. Be wary of potential future merge conflicts!

### Updating Static Content

"Static content" are things like the "about" & "guide" pages, release notes, or the landing page.

We try to make as much of this content updateable by non-engineers (by using Google Docs → Markdown conversion &
rendering the markdown). You can
see [the static markdown files & how to update them here](https://github.com/newjersey/nj-ai-assistant/tree/newjersey/client/src/nj/content).

Some static content (like the landing page) is too complex to use Markdown, so it's just coded into the client.

### Adding New Models

We're using AWS Bedrock for all our model invocations.

When picking a model, make sure that you use an **in region inference** to keep requests in the US (e.g., instead of
`anthropic.claude-sonnet-4-6`, use `us.anthropic.claude-sonnet-4-6`).

Because we use these special **in region inference** models, we have to explicitly allow them to be used in the app.
That means you must update the comma-delimited env var `BEDROCK_AWS_MODELS` (in `nj.env.template` and locally for dev).

We use [model specs](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/model_specs) to
explicitly define the list of models users are allowed to access. These are defined in `nj-librechat.yaml` and need to
be updated every time we add a new model

Warning: Any AIA conversation started with model "XYZ" is linked to model "XYZ". As such, **you should never remove old
models from the model specs** (or else old conversations will no longer accept new prompts).

### Adding Feature Flags

Feature flags allow us to deploy releases without having to reveal features still in development.

We use environment variables for flags, which allows us to turn a feature on or off for an entire environment (local,
dev, prod). There are a few files to edit for that:

- [`render-env.yml`](render-env.yml), which determines the flag's value for each environment.
    - Example: `export FOO_FLAG=$([[ "${{ inputs.environment }}" == "dev" ]] && echo true || echo false)`
- [`nj.env.template`](nj.env.template), which puts the env vars defined in `render-env.yml` into our environment.
    - Example: `FOO_FLAG=$FOO_FLAG`
- Your personal `.env` file, for local development.
    - Example: `FOO_FLAG=true`

If you want the environment variable to drive a setting in [`nj-librechat.yaml`](nj-librechat.yaml), then you'll want to
also edit [`interface.ts`](interface.ts). Use calls to `getEnvBoolean()` to replace the given configuration value.

Make sure to remove the feature flag after the feature has been released!

### Content Security Policy

The [Content Security Policy (CSP) header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) determines
which resources can be loaded onto our website. It's important to know about CSP if we ever need to load new external
resources (such as serving files from a CDN). It's especially important to know because, when developing locally,
CSP doesn't actually block anything - thus something that seems to work fine during development breaks when deployed.

If you need to modify our CSP, it's located in [`nj-helment.js`](nj-helment.js).

_(Keep in mind that Imperva also adds its own CSP headers, so the CSP may look different deployed behind Imperva than it
does when running locally.)_

### Dealing with Dependabot

NJIA has Dependabot run on all its repos, regardless of their configuration. This is at odds with our desire to stay
locked to upstream.

We just close any Dependabot updates as a result, and rely on upstream merges for dependency updates.

## Releasing to Prod

Prod release happens in two steps:

1. Create a [release](https://github.com/newjersey/nj-ai-assistant/releases) in Github, and wait for it to build and
   push
2. [OPTIONAL] If environment variables have changed, run the [render-env workflow](./.github/workflows/render-env.yml)
3. Run the [infra deploy workflow](./.github/workflows/nj-infra-deploy.yml) on the prod environment.

### Create a new release

Go to [releases](https://github.com/newjersey/nj-ai-assistant/releases) and click "Draft new release."

In the Select Tag dropdown, press Create New Tag. Format the new tag like `release-YYYYMMDD.X`. (The `.X` is an optional
increment in case multiple tags are cut per day.)

Target the `newjersey` branch.

The Release Title should be the same as the new tag.

The auto-select previous tag is fairly reliable, but you can manually set to the last tag if needed. Click "generate
release notes" to automatically generate some decent notes.

Keep "Set as the latest release" selected.

Then click "Publish release."

The new release & tag will initiate the tag build and update the `ai-assistant/prod-image-tag` SSM parameter.

### Updating Environment Files

Environment files are rendered and uploaded by [this workflow](./.github/workflows/render-env.yml). It
takes [the nj template](./nj/nj.env.template) and performs `envsubst`, pulling in values from Github environment
secrets. TechOps support will likely be needed to update those environment secrets, but Josh can do it for right now.

If either the template or the secret values have been updated, you can update the env vars by:

1. Navigate to the Actions tab in the repo
2. Select "Render and upload env file"
3. Select "Run Workflow" and select your target environment
4. The workflow will get the environment-specific values from secrets, perform `envsubst`, upload the file to S3, and
   redeploy the service.

#### Manually set release tag for prod (Rollback Strategy, DANGER)

In the event that we need to set prod to a specific release tag, we can run the `Set prod release tag` workflow in
Github Actions. This takes a text input for the release tag, and includes a verification step to ensure we're not
setting a non-existent tag. The infra deploy workflow will still need to be ran to deploy the new tag.

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
- A Secrets Manager secret that stores the connection string between the prod AIA container and DocumentDB.

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

The connection string for DocumentDB lives in AWS Secrets Manager under the name `ai-assistant/docdb/uri`. If the
DocumentDB secret is rotated, it must be updated here for AIA to maintain connection.
