# Forward uploaded images to an MCP server

Set `forwardUploadedImages: true` on an MCP server only when that server is intended
to receive the user's uploaded images. The default is off. Immediately before a tool
call, LibreChat replaces only exact, full-string current-request placeholders such as
`/mnt/data/0.png` with validated `data:image/...;base64,...` URLs. This works for any
tool name and any JSON argument position, including nested objects and arrays.

LibreChat forwards only placeholders explicitly present in the tool arguments. Unrelated
attachments, unrelated paths, URLs, generated `/app/storage/...` paths, substrings, and
non-image values stay unchanged. Servers that omit this setting or set it to `false` leave
all argument values unchanged.

When `forwardUploadedImages: true` is enabled, an exact current-request upload placeholder
represents intent to forward that upload. If its image is missing, unowned, foreign,
mismatched, unencodable, invalid, or oversized, LibreChat aborts the tool call before
`mcpManager.callTool` and before the MCP server receives it. The resulting error is bounded
and does not include image payload data.

## Privacy and deployment considerations

Enabling this option discloses the referenced uploaded image content to the configured
MCP server. Only enable it for servers you trust with that content. Base64 expands the
payload and can exceed downstream MCP/proxy JSON body limits; configure and validate
those limits for the largest uploads your deployment allows.
