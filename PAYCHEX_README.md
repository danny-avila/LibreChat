## Making Workflow changes
Make workflow changes only on the `main` branch. Since workflows need to exist on the main branch to executable on github. The `main` branch is not used for anything else other than storing workflows. Despite the main branch containing code for Librechat. Ignore that code.

## Syncing Tags from the Upstream Librechat Repository
From a local terminal, while having the `main` branch checked out, run:

```
git remote add upstream https://github.com/danny-avila/LibreChat.git #This needs to only be ran once
git fetch upstream --tags #This should run everytime to fetch the tags
```
then:
```
git push origin --tags #pushes all tags to our forked repo
```



## Changing Paychex specific files
The following is a list of files that are specific to the Paychex build and release of Librechat:

- `az_container_app_definitions` - contains the yaml definitions for the ACA.

- `mongodb_atlas_setup` - contains one time JS commands to create Vector-related objects in MongoDB Atlas.
  
- `.paychex.dockerignore` - contains files to ignore when building the Paychex docker image.

- `librechat.n1.yml` - contains the N1 configuration for the n1 deployment.

- `librechat.n2a.yml` - contains the N2a configuration for the n2a deployment.

- `librechat.prod.yml` - contains the prod configuration for the prod deployment.

- `paychex-root.pem` - contains the Paychex SSL cert.

- `payx-docker-compose.override.yml` - contains the Paychex docker compose override file.

Only these files exist on `paychex-integration-branch` branch. **If you need to modify or add, it has to be done on this branch.**


## Running Librechat Locally
This process is a somewhat complicated git dance.
1. Fetch branches and tags `git fetch --tags`.
2. Ensure you have the latest integration branch, `git checkout paychex-integration-branch && git pull origin paychex-integration-branch`
3. Checkout the tag you want to run locally. For example, `git checkout v0.8.0-rc2`. You'll now be in Detached Head Mode.
4. Run a `git merge paychex-integration-branch --allow-unrelated-histories`. Git will complain about the merge unless you have that flag.

Next, copy the contents of `.env.paychex` into `.env`. There are certain sensitive values you'll need, ask Shane for these.

Next, copy the contents of `librechat.n2a.yml` into `librechat.yaml`. NOTE: The file extension for `librechat.yaml` is `.yaml`. This is important.

Next, in `payx-docker-compose.override-yaml`, change the Librechat Image tag to the tag you are working with. ie. `image: ghcr.io/danny-avila/librechat:v0.8.0-rc2`:

```
api:
    container_name: LibreChat
    ports:
      - "${PORT}:${PORT}"
    image: ghcr.io/danny-avila/librechat:v0.8.0-rc2 #This part here
```

Next, run the compose files: `docker compose -f docker-compose.yml -f payx-docker-compose.override.yaml up`. This will merge the two compose files together and start up the cluster.

Navigate to `localhost:3080` in browser. If running in a VSCode terminal via remote ssh, ensure the Port is forwarded.

Register a test user using the sign-up form, and then login with that test user.

Make any changes to the configuration files as needed. Then, use the following instructions to release.

## Creating a new Paychex-ified Release
6. Manually port any Paychex file changes into `paychex-integration-branch`. Usually editing the files via Github editor is easiest.
7. Commit changes, then create a new branch with branch name pattern `release/{original_tag}-payx`. For example, `git checkout -b release/v0.8.0-rc2-payx`.
8. Push the new branch up. `git push origin release/v0.8.0-rc2-payx`.
9. Run the workflow for the environment you are targeting. Use the new branch you've created as the input branch. Optionally build the RAG API image (usually this is done once for a new release, and can be skipped if deploying the same release again maybe after troubleshooting, etc.).
