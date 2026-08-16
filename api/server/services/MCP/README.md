# ImageTools uploaded-image bridge

`edit_image` on the configured `image-generation` MCP server recognizes LibreChat's
vision-upload placeholders such as `/mnt/data/0.png`. Before the MCP call, LibreChat
loads the current request's owned image attachment and replaces that placeholder with
a `data:image/...;base64,...` URL. ImageTools can read that URL without a shared
upload volume.

Deployment requirements:

- Run a LibreChat image containing this change (the candidate is based on
  `v0.8.8-rc1`).
- Keep the ImageTools MCP server configuration name as `image-generation` and its
  edit tool as `edit_image`.
- No ImageTools volume or URL configuration is required for uploads. Existing
  `/app/storage/...` generated-image arguments are deliberately passed through
  unchanged.
