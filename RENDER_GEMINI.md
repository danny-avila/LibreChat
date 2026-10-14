# Gemini on Render

This fork uses LibreChat's built-in Google endpoint. The tracked `librechat.yaml`
sets the Gemini models and conversation title model. `.dockerignore` includes
this configuration in the Docker image built from the repository.

## Setup

1. In the existing Render service, change **Settings > Build > Source** to
   `premsunpet/LibreChat-fork`, branch `main`, using the existing Docker runtime.
2. In **Environment**, set `GOOGLE_KEY` to your Google AI Studio API key.
   Never commit the actual key to GitHub.
3. If `ENDPOINTS` is already set, add `google` to its comma-separated list.
   To show only Gemini, set `ENDPOINTS=google`. If it is unset, LibreChat uses
   its default endpoint selection.
4. Set `CONFIG_PATH=/app/librechat.yaml` so this deployment loads the bundled file.
5. If `GOOGLE_MODELS` is already set, remove it or align it with the models in
   `librechat.yaml` to avoid a conflicting model list.
6. Save the environment settings and deploy the merged commit. Select **Google**
   in LibreChat and choose a Gemini model.

Keep the existing database, authentication, and other deployment environment
variables. Model availability, quotas, and pricing depend on the Google account;
this configuration does not guarantee free API usage.

## Docker Compose

For Docker Compose deployments, keep the existing bind mount from
`./librechat.yaml` to `/app/librechat.yaml`. A mounted file overrides the bundled
configuration. Render builds this repository's Dockerfile directly and does not
use Docker Compose volume mounts.

## References

- https://www.librechat.ai/docs/configuration/pre_configured_ai/google
- https://www.librechat.ai/docs/configuration/librechat_yaml
