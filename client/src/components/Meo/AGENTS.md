# Meo AI Web agent rules

This directory is the Meo-owned web product surface. The repository root `AGENTS.md` still applies for monorepo architecture, TypeScript, API boundaries, localization, accessibility, testing and CI. These rules add the Meo product contract and take precedence for Meo-specific UX decisions.

## Source of truth

Meo AI is one product across native desktop, Web and mobile. The current native desktop client is the primary product/interaction reference for the web surface.

Before making a visible or behavioral Meo Web change, inspect the corresponding native implementation in `QwQdoge/meo-ai`, especially:

- `meo/app/qml/Main.qml` — workspace, navigation, chat, composer, responsive layout and inspector
- `meo/app/qml/DetailsPane.qml` and `ResponseDetails.qml` — response details and runtime information
- `meo/app/qml/AiControlsPopup.qml` — model/runtime controls, resources and memory entry points
- `meo/app/qml/PrimaryModeLanding.qml`, `ProjectsPage.qml` and related mode surfaces
- `meo/app/qml/MemoryPanel.qml` and `LongPastePanel.qml`
- `meo/README.md` and AgentService contracts for request, cancellation, reconnect, resource and tool-decision semantics
- root `AGENTS.md` in `QwQdoge/meo-ai` for unified product/ownership/security rules

For shared visual semantics, inspect `QwQdoge/MeoUI` rather than inventing a separate Web aesthetic. Translate MeoUI semantic intent into the Web token system; do not mechanically copy QML implementation details.

Do not use generic LibreChat UI as the product reference when a Meo native equivalent exists. LibreChat remains infrastructure and a source of reusable implementation primitives, not the Meo product design authority.

## Shared Meo AI core invariant

`Chat`, `Work`, `Projects` and `Skills` are different product surfaces over one shared Meo AI core and protocol. They must not grow independent copies of agent or business logic.

The default architecture is:

- one shared agent/runtime contract
- one shared conversation/message model
- one shared AgentRun/event/approval/cancellation model
- one shared Skills/tool/MCP capability model
- one shared Projects/context/artifact model
- one shared model-routing and memory contract
- one shared device registry and remote Work contract
- platform-specific transports and capability adapters only where the platform actually differs

Client applications are presentation and platform-adaptation layers. Web, Linux, Windows, macOS and Android may use different renderers and local integrations, but they should consume the same shared contracts and backend behavior instead of reimplementing the same feature logic.

Before adding logic to a client, ask whether it belongs in the shared Meo AI core/protocol. If the answer is yes, implement it there first and make clients render/drive the shared contract. Do not add a Web-only, desktop-only or Android-only implementation of an agent loop, Skill execution engine, Project semantics, memory behavior, model routing, approval state machine or Work orchestration when the behavior is conceptually cross-platform.

Platform-specific code is allowed only for genuine capability differences, for example:

- native AgentService/local execution
- System AI Router and OS integrations
- secure credential storage
- filesystem/browser/app adapters
- Android intents or mobile-only capabilities
- Web transport/session/browser constraints

Keep these behind capability adapters or transport boundaries so the product logic above them remains shared.

`Chat` and `Work` should converge on the same AgentRun/event protocol. Their main difference is execution policy and target: ordinary Chat can run without a device target, while Work binds a run to an explicit local/remote environment and exposes device capabilities, progress, approvals and resumable execution. Do not create a second Work-specific agent engine.

Skills describe reusable behavior and required capabilities; they do not own separate per-client execution implementations. Projects provide persistent context/files/conversations around the same shared runtime. UI should primarily display and manipulate shared state, not become the authority for business rules.

A feature is architecturally incomplete if equivalent logic must be fixed independently in multiple clients.

## Product parity contract

The top-level product hierarchy is fixed:

1. Chat
2. Work
3. Projects
4. Skills

Keep names, information hierarchy and core placement aligned with native unless a browser constraint requires adaptation. Desktop Web should visually and behaviorally resemble the native client at equivalent viewport sizes. Compact/mobile Web keeps the same hierarchy in a left navigation drawer; do not invent a separate bottom-navigation information architecture.

Parity means more than matching colors. For every native surface being ported, account for:

- layout and responsive behavior
- loading, empty, success, streaming/busy, failure, cancellation and retry states
- keyboard behavior and focus
- tool/permission confirmation
- message actions and response details
- models and AI controls
- resources/attachments and long-paste context
- managed memory
- presentation/result cards where supported
- conversation search/history/title behavior
- Projects, Skills and Work entry points
- Settings and Meo Account/session entry points
- accessibility and reduced-motion behavior

Do not mark a surface as parity-complete because only its static appearance matches.

## Native-to-Web capability rule

Preserve the same product concept, but never fake native authority in a browser.

- Native `This computer` / local AgentService execution maps on Web to the current browser plus authenticated Meo devices/remote Work targets when supported.
- Web must not expose D-Bus, local shell, System AI Router, privileged filesystem or desktop-only capabilities as if they are locally available.
- A disabled/unavailable state must say why and point to the valid Web/remote path.
- Remote Work must use authenticated device/account contracts and explicit target selection; never introduce a generic remote shell.
- Attachments belong to the active Chat, project files belong to Projects, and Work outputs belong to Work. Do not create a generic resource bucket that erases ownership.

When the native client has a capability that the Web backend does not yet expose, build the correct UI state/contract boundary if useful, but do not fabricate successful behavior. Track the missing backend/API dependency explicitly.

## Meo Account and identity

Meo AI Web is a Meo Account client, not a second identity system.

- Do not add a separate Meo AI password database or product-specific identity flow.
- Google/GitHub/email/passkey/2FA choices belong to Meo Account when Meo Account provides them.
- Preserve OAuth/OIDC redirect destinations and authenticated session semantics.
- Do not expose raw provider/BYOK secrets to the browser when an Account/broker contract owns them.
- Account/session/security UI should feel like the same product as native, while authentication authority remains Meo Account.

## Web component and styling rules

Use semantic theme tokens and existing accessible primitives first. Do not hard-code raw palette values or fork a second Meo design system inside this directory.

When translating native MeoUI:

- preserve semantic roles (surface hierarchy, primary/secondary containers, outline hierarchy, content emphasis)
- preserve the native spacing/radius/layout intent where practical
- preserve native responsive thresholds/behavior where they make sense on Web
- prefer CSS/layout primitives over JavaScript viewport branching
- support light/dark themes and `prefers-reduced-motion`
- use semantic HTML, visible focus, keyboard navigation and useful ARIA names

If a reusable Web primitive is missing, add or deepen a shared primitive/token instead of repeatedly embedding one-off class strings in Meo feature files.

## State and API ownership

Do not turn `MeoChat.tsx` into a monolithic permanent implementation while porting native features.

Split product concerns by ownership as parity grows, for example:

- workspace/navigation shell
- conversation/message surface
- composer
- response inspector/details
- AI/model controls
- resources/attachments
- memory
- Projects
- Skills
- Work/device targets

Use React Query for server state and mutations according to the root rules. Use feature-owned Jotai state for new local state that must survive component boundaries. Avoid adding new Recoil dependencies.

Shared endpoint definitions/types/services belong in `packages/data-provider`; backend behavior belongs in `packages/api`; database contracts belong in `packages/data-schemas`. Do not hide new backend behavior in legacy `/api` wiring.

Streaming/request semantics should converge toward native AgentService behavior where the cloud/Web contract supports it: stable request identity, explicit cancellation, resumable/reconnectable streams, explicit tool decisions and no duplicate replay of side-effectful work. Do not retry a submitted action by silently creating a second request.

## Localization

All normal user-visible product copy must use the repository localization system. Native English strings are the semantic reference, not permission to hard-code English in React. Add/update English keys first as required by the root rules.

Keep user-facing terminology aligned with native: `Chat`, `Work`, `Projects`, `Skills`, `AI settings`, `Response details`, `Memory`, and related product terms should not drift between platforms without a deliberate cross-product change.

## Porting workflow

For a parity task:

1. Read the native source for that exact surface and its states.
2. Inventory existing Web APIs/components that can support it.
3. Write down any capability gaps rather than faking them.
4. Implement the smallest coherent vertical slice, including all observable states.
5. Add focused tests for behavior, not only snapshots.
6. Check compact and desktop layout, keyboard access, light/dark theme and reduced motion when relevant.
7. Run scoped formatting/import sorting, TypeScript, tests and static checks from the root guidance.
8. Compare the finished surface against native again before calling it complete.

Do not perform opportunistic rewrites of unrelated LibreChat code just to make the repository look Meo-native. Keep the Meo patch surface deliberate and separable from upstream infrastructure.

## Definition of parity-complete

A feature can be called parity-complete only when:

- every native user-visible state that is meaningful on Web has a Web equivalent;
- browser-inapplicable native capabilities have an explicit, truthful adaptation rather than disappearing silently;
- the visual hierarchy and interaction placement match native closely at comparable sizes;
- auth/security/permission ownership remains correct;
- loading/error/cancel/retry/restoration behavior is implemented;
- visible copy is localized and accessibility is intact;
- focused tests/typechecks/static checks are green;
- any remaining capability gap is documented rather than implied to work.

If these conditions are not met, describe the work as a parity slice or parity progress, not full desktop parity.
