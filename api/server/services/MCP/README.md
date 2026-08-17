# Forward uploaded images to an MCP server

Set `forwardUploadedImages: true` on an MCP server only when that server is intended
to receive the user's uploaded images. The default is off. Immediately before a tool
call, LibreChat replaces only exact, full-string current-request placeholders such as
`/mnt/data/0.png` with validated `data:image/...;base64,...` URLs. This works for any
tool name and any JSON argument position, including nested objects and arrays.

LibreChat forwards only placeholders explicitly present in the tool arguments. It
does not forward unrelated attachments, generated `/app/storage/...` paths, arbitrary
paths, URLs, or non-image placeholders. Missing, unowned, and unencodable files stay
unchanged.

## Privacy and deployment considerations

Enabling this option discloses the referenced uploaded image content to the configured
MCP server. Only enable it for servers you trust with that content. Base64 expands the
payload and can exceed downstream MCP/proxy JSON body limits; configure and validate
those limits for the largest uploads your deployment allows.
