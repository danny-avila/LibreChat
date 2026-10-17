# Legacy migration surface only

`meo-pages` is not a second Meo AI client.

The canonical Web application is the React/TypeScript app under `../client/`.

## Hard rules

- Do **not** add new Chat, Work, Projects, Skills, Memory, Agent, model-routing, artifacts, device, remote-runtime, or other Meo AI product behavior under `meo-pages/public` or Pages Functions.
- Do **not** create Web-only copies of Meo AI business state or contracts here.
- Product behavior belongs in the shared Meo AI backend/contracts (`meo-api` / shared core) and the canonical React client.
- `meo-pages/public/*` is legacy rollback material during migration only.
- Pages Functions may remain only as a thin Web transport/BFF layer for browser-specific concerns such as OAuth/OIDC PKCE, callback handling, secure HttpOnly session cookies, and minimal same-origin forwarding.
- The Web edge must not become an authority for Conversation, Project, Project Memory, Skill, AgentRun, Work, Device, Tool approval, artifact, usage, or model-routing state.

If a requested feature changes Meo AI product behavior, implement it outside `meo-pages` and expose it to the React Web through shared APIs/contracts.
