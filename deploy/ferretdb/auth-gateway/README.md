# Auth Gateway Reference Configs

These examples sit in front of the local LibreChat tenant gateway at `http://127.0.0.1:3080`.

Trust boundary:

- Browser clients must never be allowed to choose `X-Tenant-Id` or `X-Auth-Tenant-Id`.
- The public auth gateway must strip both headers from the client request.
- The auth service must authenticate the user and return exactly one trusted `X-Auth-Tenant-Id` response header.
- The local LibreChat tenant gateway validates `X-Auth-Tenant-Id`, rewrites it to `X-Tenant-Id`, and clears `X-Auth-Tenant-Id` before proxying to the API.

Run the public conformance check after adapting one of these examples:

```bash
AUTH_GATEWAY_URL=https://chat.yourdomain.tld \
AUTH_GATEWAY_VALID_HEADERS_JSON='{"Cookie":"session=replace-with-valid-session"}' \
npm run smoke:auth-gateway
```

The conformance test is deliberately generic. It verifies unauthenticated spoof attempts cannot reach LibreChat and, when valid auth headers are supplied, that a spoofed tenant header does not break the authenticated flow. It cannot prove the auth service chose the correct tenant unless your auth layer exposes a tenant-specific diagnostic or you run application-level tenant isolation tests with two real tenant sessions.
