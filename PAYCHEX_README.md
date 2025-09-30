## Making Workflow changes
Make workflow changes only on the `main` branch. Since workflows need to exist on the main branch to executable on github. The `main` branch is not used for anything else other than storing workflows. Despite the main branch containing code for Librechat. Ignore that code.

## Syncing Tags from the Upstream Librechat Repository
A daily cron workflow called `sync_tags` will fetch and push tags from the upstream to this repo. You can also manually run the workflow.

## Changing Paychex specific files
The following is a list of files that are specific to the Paychex build and release of Librechat:
`az_container_app_definitions` - contains the yaml definitions for the ACA.
`mongodb_atlas_setup` - contains one time JS commands to create Vector-related objects in MongoDB Atlas.
`.paychex.dockerignore` - contains files to ignore when building the Paychex docker image.
`librechat.n1.yml` - contains the N1 configuration for the n1 deployment.
`librechat.n2a.yml` - contains the N2a configuration for the n2a deployment.
`librechat.prod.yml` - contains the prod configuration for the prod deployment.
`paychex-root.pem` - contains the Paychex SSL cert.
`payx-docker-compose.override.yml` - contains the Paychex docker compose override file.

Only these files exist on `paychex-integration-branch`. **If you need to modify or add, it has to be done on this branch.**

## Creating a new Paychex-ified Release
This process is a somewhat complicated git dance.
1. Fetch branches and tags `git fetch --tags`.
2. Locally, checkout `paychex-integration-branch`.
3. Checkout the tag you want to release. For example, `git checkout v0.8.0-rc2`.
4. Run a `git merge paychex-integration-branch`.
5. Create a new tag with the pattern `{original_tag}-payx`. For example, `git tag v0.8.0-rc2-payx`.
6. Push the new tag up.
7. Run the workflow for the environment you are targeting. Use the new tag you've created as the input tag. Optionally build the RAG API image (usually this is done once for a new release, and can be skipped if deploying the same release again maybe after troubleshooting, etc.).
