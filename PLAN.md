# LibreChat Artifact Apps – Implementierungsplan

> ## ⚠️ STATUS FÜR FORTSETZENDEN AGENTEN (Stand: 2026-07-14, Branch `feat/artifact-apps-wp0-wp6`)
>
> Ein vorheriger Coding-Agent wurde wegen Credit-Erschöpfung mitten in der Ausführung gestoppt. Der Fortschritt ist committet und gepusht auf `feat/artifact-apps-wp0-wp6`. Bitte **auf diesem Branch weiterarbeiten** (nicht neu von main starten). Es wurde noch **kein PR** geöffnet.
>
> ### ✅ Bereits erledigt (committet)
> - **WP0 – Exploration/ADRs**: `docs/artifact-apps/WP0-exploration.md`, `docs/artifact-apps/adr-0001-snapshot-storage.md`, `docs/artifact-apps/adr-0002-mcp-bridge.md`
> - **WP1 – Persistenz**: `packages/data-schemas/src/schema/artifactApp.ts`, `artifactVersion.ts`, Models, `methods/artifactApp.ts` (+ `.spec.ts`), Index-Migration `migrations/artifactAppIndexes.ts`
> - **WP2 – ACL/Capabilities**: `ARTIFACT_APP`-ResourceType, Owner/Editor/Viewer-Rollen, Capabilities, Audit-Actions in `data-schemas` (admin/capabilities.ts, methods/accessRole.ts + spec)
> - **WP3 – Publishing API**: `packages/api/src/artifactApps/handlers.ts` (+ `.spec.ts`, 274 Zeilen Tests), Express-Routen `api/server/routes/artifactApps.js`, Access-Middleware `canAccessArtifactAppResource.js`
> - **WP4 – Versioning**: Draft/Release/Activate/Withdraw/Rollback-Handler bereits in `handlers.ts` und `data-provider/artifactApps.ts` enthalten
> - **WP5/WP6 – Frontend (NUR TEILWEISE, WIP)**: `client/src/components/ArtifactApps/StandaloneAppView.tsx`, `AppRenderer.tsx`, react-query Queries/Mutationen in `client/src/data-provider/ArtifactApps/`, i18n-Keys in `translation.json`
>
> ### ❌ Noch offen — HIER WEITERMACHEN
> 1. **Build/Lint/Typecheck/Tests einmal komplett grün durchlaufen lassen** und alle Fehler fixen (wurde vor Abbruch nicht final verifiziert). Zwei `rollup.fallback.mjs`-Dateien wurden vom vorherigen Agenten als Workaround angelegt — prüfen, ob diese wirklich nötig sind oder ein echtes Build-Problem verdecken; ggf. richtige Lösung statt Fallback einbauen.
> 2. **WP5 fertigstellen**: Standalone-Viewer-Routen `/apps/:artifactAppId` und `/apps/:artifactAppId/version/:versionId` in den Client-Router einhängen (Routing fehlt noch), 403/404/suspended/archived-States im UI final prüfen, Viewer-Tests ergänzen.
> 3. **WP6 fertigstellen**: "Publish as App"-Aktion im Artifact-Menü ergänzen (fehlt komplett), mehrstufiger Publish-Dialog (§9.1) inkl. Wiederverwendung des bestehenden People Pickers, ACL-Rollenauswahl, Sichtbarkeit, Tool-Policy-Auswahl, Review-Summary. UI-Tests ergänzen.
> 4. **Nach Fertigstellung**: Einen **einzigen kombinierten PR** von `feat/artifact-apps-wp0-wp6` gegen `main` öffnen (per `gh pr create`), mit Beschreibung aller WP0–WP6-Änderungen, Testresultaten und bekannten Einschränkungen.
> 5. Scope bleibt **WP0–WP6** — WP7–WP13 (Embed-Sandbox, Marketplace, MCP-Bridge, HITL, Fork, Export, Hardening) sind explizit NICHT Teil dieses Durchgangs.
>
> ---

## 1. Ziel

Dieser Plan führt die Anforderungen aus folgenden LibreChat-Themen zusammen:

- Discussion #12976: **LibreChat AppServer / Instant Apps**
- Issue #13374: **Standalone Artifact Publishing and Sharing**

Ein in einer Unterhaltung erzeugtes Artifact soll als eigenständige **Artifact App** veröffentlicht werden können. Die App soll unabhängig von Conversation und Message bestehen, eine stabile URL besitzen, versioniert, geteilt, eingebettet und in einem tenantweiten Marketplace angeboten werden können. Optional darf die App explizit freigegebene MCP-Tools verwenden. Authentifizierung, Autorisierung und Tool-Aufrufe bleiben vollständig unter Kontrolle von LibreChat.

## 2. Definition of Done

Die Implementierung ist abgeschlossen, wenn:

- ein vorhandenes Artifact als eigenständige Artifact App veröffentlicht werden kann;
- die veröffentlichte App nach Löschen oder Ändern der Quell-Conversation weiterhin unverändert funktioniert;
- jede App eine stabile Standalone-URL besitzt;
- private, eingeschränkte, tenantweite und optional öffentliche Lesesichtbarkeit unterstützt werden;
- Owner-, Editor- und Viewer-Rechte über das bestehende LibreChat-ACL-System funktionieren;
- mehrere Owner möglich sind;
- unveränderliche Versionen erstellt, veröffentlicht, aktiviert und zurückgerollt werden können;
- eine read-only Artifact-only-Ansicht ohne Chat existiert;
- eine sandboxed Embed-Ansicht existiert;
- Apps geforkt werden können;
- Apps in einer Marketplace-Kategorie sichtbar sind;
- erlaubte MCP-Tools über LibreChat und im Kontext des angemeldeten Benutzers aufgerufen werden können;
- Artifact-Code niemals OAuth-Tokens, Session-Tokens, API-Keys oder MCP-Credentials erhält;
- Schreibaktionen eine explizite Bestätigung verlangen;
- alle relevanten Aktionen auditiert werden;
- Unit-, Integrations-, E2E-, ACL- und Security-Tests vorhanden und erfolgreich sind;
- Typecheck, Linter und Build erfolgreich laufen.

## 3. Scope

### 3.1 In Scope

- eigenständige `ArtifactApp`-Ressource;
- unveränderliche `ArtifactVersion`-Snapshots;
- Publish aus einem vorhandenen Artifact;
- stabile Standalone-URL;
- Artifact-only Viewer;
- read-only Embed;
- App-Lifecycle und Status;
- ACL mit Owner, Editor und Viewer;
- Freigabe an Benutzer, Gruppen und Rollen;
- tenantweite Sichtbarkeit;
- optionale öffentliche statische Ansicht;
- Versionierung und Rollback;
- Fork;
- Marketplace-Kategorie „Apps“;
- MCP-Tool-Allowlist pro App;
- MCP-Aufrufe mit serverseitigem Benutzerkontext;
- HITL für schreibende/destruktive Tools;
- Audit und Nutzungsereignisse;
- statischer Export als späteres Arbeitspaket innerhalb des Projekts.

### 3.2 Nicht in Scope

- Scheduler;
- Webhooks und externe Event-Trigger;
- automatische GitHub-/GitLab-/Azure-DevOps-Synchronisierung;
- automatische Code-Reparatur durch Coding-Agenten;
- anonyme öffentliche MCP-Ausführung;
- beliebige Netzwerkzugriffe aus Artifact-Code;
- beliebige npm-Paketinstallation;
- eigene persistente App-Datenbanken;
- eigener visueller Flow-Builder;
- Umbau der bestehenden Agent-Runtime;
- neue OAuth- oder MCP-Implementierung neben LibreChats bestehendem MCPManager.

## 4. Architekturregeln

LibreChats bestehende Workspace-Grenzen sind einzuhalten:

- `packages/data-schemas`: MongoDB-Schemas, Models, DB-Methoden, Migrationen und ACL-nahe Logik;
- `packages/data-provider`: gemeinsame Typen, Zod-Schemas, Query Keys und API-Verträge;
- `packages/api`: neue Backend-Services, Publishing, Versionierung, MCP-Bridge und Audit;
- `api`: ausschließlich dünne Express-Routen/Controller zur Integration;
- `client`: React-UI, Viewer, Publish-Dialog, Marketplace und Berechtigungsverwaltung;
- vorhandene Komponenten für ACL, Sharing, People Picker, Audit, MCP, OAuth, HITL und Marketplace sind wiederzuverwenden;
- es darf kein paralleles Berechtigungssystem entstehen;
- alle DB-Abfragen müssen Tenant-Isolation erzwingen;
- veröffentlichte Versionen sind immutable;
- Conversation- und Message-IDs sind nur Herkunftsmetadaten, keine Laufzeitabhängigkeit.

## 5. Zielarchitektur

```text
Conversation / Message
        │
        └── Artifact
              │
              └── Als App veröffentlichen
                        │
                        ▼
                  ArtifactApp
                  ├── stabile ID und URL
                  ├── ACL
                  ├── Marketplace-Metadaten
                  ├── Tool-Policy
                  ├── aktive Version
                  └── ArtifactVersion[]
                              │
                              ▼
                    Standalone / Embed Viewer
                              │
                              ▼
                     Artifact Tool Bridge
                              │
                              ▼
                    bestehender MCPManager
                    ├── aktueller User-Kontext
                    ├── OAuth/OBO pro User
                    ├── Tool-Allowlist
                    ├── HITL
                    └── Audit
```

## 6. Datenmodell

### 6.1 ArtifactApp

```ts
interface ArtifactApp {
  artifactAppId: string;
  tenantId: string;

  title: string;
  description?: string;
  icon?: string;
  category?: string;
  tags?: string[];

  createdBy: string;
  activeVersionId?: string;
  latestVersionNumber: number;

  status:
    | 'draft'
    | 'pending_review'
    | 'published'
    | 'suspended'
    | 'archived';

  visibility:
    | 'private'
    | 'restricted'
    | 'tenant'
    | 'public';

  allowEmbed: boolean;
  allowFork: boolean;
  allowAnonymousView: boolean;

  toolPolicy: {
    enabled: boolean;
    allowedServers: string[];
    allowedTools: string[];
    requireConfirmationForWrites: boolean;
  };

  marketplace: {
    listed: boolean;
    featured: boolean;
    summary?: string;
    riskClass: 'none' | 'read' | 'write' | 'external';
    costClass: 'free' | 'low' | 'medium' | 'high';
  };

  sourceMetadata?: {
    conversationId?: string;
    messageId?: string;
    originalArtifactId?: string;
  };

  review?: {
    submittedAt?: Date;
    submittedBy?: string;
    reviewedAt?: Date;
    reviewedBy?: string;
    result?: 'approved' | 'rejected';
    comment?: string;
  };

  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}
```

### 6.2 ArtifactVersion

```ts
interface ArtifactVersion {
  artifactVersionId: string;
  artifactAppId: string;
  tenantId: string;

  versionNumber: number;
  versionLabel?: string;
  changelog?: string;

  artifactType: 'react' | 'html' | 'mermaid';
  sourceSnapshot: string;

  runtimeConfig: {
    dependencies?: Record<string, string>;
    entryPoint?: string;
    renderMode?: string;
  };

  integrity: {
    sourceHash: string;
    schemaVersion: number;
  };

  createdBy: string;
  createdAt: Date;

  publication: {
    state: 'draft' | 'released' | 'withdrawn';
    releasedBy?: string;
    releasedAt?: Date;
  };
}
```

### 6.3 ACL

Neuer ResourceType:

```ts
ResourceType.ARTIFACT_APP
```

Versionen erben die Rechte der App; kein eigener `ARTIFACT_VERSION`-ACL-Typ, solange kein fachlicher Bedarf entsteht.

Rollen:

- Owner: vollständige Verwaltung, ACL, Tool-Policy, Veröffentlichung und Archivierung;
- Editor: neue Draft-Versionen erstellen und bearbeiten;
- Viewer: App anzeigen und freigegebene Funktionen verwenden;
- Admin-Capability: tenantweite Verwaltung, Suspendierung und Review.

### 6.4 Indizes

Mindestens:

- eindeutiger Index auf `tenantId + artifactAppId`;
- eindeutiger Index auf `tenantId + artifactAppId + versionNumber`;
- Index auf `tenantId + status + visibility`;
- Index auf `tenantId + marketplace.listed + marketplace.featured`;
- Index auf `tenantId + createdBy`;
- Index auf `tenantId + activeVersionId`.

## 7. Lifecycle

```text
draft
  → pending_review
      → published
      → rejected → draft

published
  → suspended
  → archived

suspended
  → published
  → archived
```

Regeln:

- nur Owner können Freigaben und Tool-Policy ändern;
- nur Owner oder entsprechend berechtigte Reviewer können veröffentlichen;
- veröffentlichte Versionen werden nie überschrieben;
- Änderungen erzeugen eine neue Version;
- Rollback setzt `activeVersionId` auf eine ältere veröffentlichte Version;
- suspendierte oder archivierte Apps dürfen keine MCP-Tools ausführen;
- gelöschte Quell-Conversations verändern Artifact Apps nicht.

## 8. API

### 8.1 App-Lifecycle

```http
POST   /api/artifact-apps
GET    /api/artifact-apps
GET    /api/artifact-apps/:artifactAppId
PATCH  /api/artifact-apps/:artifactAppId
DELETE /api/artifact-apps/:artifactAppId
```

`POST /api/artifact-apps`:

1. authentifizierten Benutzer aus Server-Session bestimmen;
2. Zugriff auf Quell-Conversation/Message prüfen;
3. Artifact anhand bestehender Artifact-Struktur extrahieren;
4. Source normalisieren;
5. vollständigen Snapshot erzeugen;
6. SHA-256 oder projektüblichen Hash erzeugen;
7. `ArtifactApp` und `ArtifactVersion` atomar anlegen;
8. Owner-ACL vergeben;
9. Audit-Event schreiben;
10. App und Version zurückgeben.

### 8.2 Versionen

```http
POST /api/artifact-apps/:id/versions
GET  /api/artifact-apps/:id/versions
GET  /api/artifact-apps/:id/versions/:versionId
POST /api/artifact-apps/:id/versions/:versionId/release
POST /api/artifact-apps/:id/versions/:versionId/activate
POST /api/artifact-apps/:id/versions/:versionId/withdraw
```

### 8.3 Sharing

```http
GET    /api/artifact-apps/:id/permissions
POST   /api/artifact-apps/:id/permissions
PATCH  /api/artifact-apps/:id/permissions/:permissionId
DELETE /api/artifact-apps/:id/permissions/:permissionId
```

Bestehenden People Picker und vorhandene Principal-Typen nutzen.

### 8.4 Review und Publishing

```http
POST /api/artifact-apps/:id/submit
POST /api/artifact-apps/:id/approve
POST /api/artifact-apps/:id/reject
POST /api/artifact-apps/:id/suspend
POST /api/artifact-apps/:id/unpublish
```

### 8.5 Fork

```http
POST /api/artifact-apps/:id/fork
```

Fork kopiert:

- aktive Version als neue Version 1;
- Source und freigegebene Runtime-Konfiguration;
- Titel/Beschreibung als bearbeitbare Ausgangswerte.

Fork kopiert nicht:

- ACLs;
- Owner;
- Review-/Marketplace-Status;
- Audit-Historie;
- Nutzungsdaten;
- OAuth-/MCP-Credentials;
- Installationen anderer Benutzer.

### 8.6 Marketplace

```http
GET    /api/marketplace/apps
GET    /api/marketplace/apps/:id
POST   /api/marketplace/apps/:id/install
DELETE /api/marketplace/apps/:id/install
```

Filter:

- Suchtext;
- Kategorie;
- Tags;
- Owner/Team;
- Risikoklasse;
- Kostenklasse;
- featured;
- installiert;
- zuletzt aktualisiert.

### 8.7 Tool Bridge

```http
POST /api/artifact-apps/:id/tools/invoke
```

Request:

```json
{
  "versionId": "...",
  "server": "m365",
  "tool": "search_sharepoint",
  "arguments": {},
  "invocationId": "..."
}
```

Der Server ignoriert alle vom Artifact gelieferten User-, Tenant-, Rollen- oder Tokenangaben.

## 9. Frontend

### 9.1 Publish-Dialog

Am Artifact-Menü neue Aktion:

```text
Als App veröffentlichen
```

Schritte:

1. Allgemein: Titel, Beschreibung, Icon, Kategorie, Tags;
2. Freigabe: Sichtbarkeit, Owner, Editor, Viewer;
3. Tools: MCP-Server und Tools auswählen;
4. Sicherheit: Risiko, Fork, Embed, Public View;
5. Veröffentlichung: Changelog, Review, Zusammenfassung.

### 9.2 Standalone Viewer

Route:

```text
/apps/:artifactAppId
/apps/:artifactAppId/version/:versionId
```

Anforderungen:

- kein Chatverlauf;
- App-Metadaten und aktive Version;
- isolierter Artifact Renderer;
- Versionsauswahl entsprechend Berechtigung;
- Fork-Aktion;
- klare Zustände für 403, 404, suspended und archived;
- keine Editierfunktionen für Viewer.

### 9.3 Embed Viewer

Route:

```text
/embed/apps/:artifactAppId
```

Anforderungen:

- minimales Layout;
- restriktive iframe-Sandbox;
- keine LibreChat-Navigation;
- kein Chat;
- kein Zugriff auf Parent-DOM;
- Kommunikation nur per validiertem `postMessage`;
- keine Tokens oder Secrets in URL, DOM oder Client-State;
- Embed nur, wenn App und Tenant-Konfiguration dies erlauben.

### 9.4 Marketplace

```text
Marketplace
├── Agents
├── Skills
├── Tools
└── Apps
```

App-Karte:

- Icon;
- Titel;
- Kurzbeschreibung;
- Eigentümer/Team;
- Kategorie und Tags;
- Risiko- und Kostenklasse;
- aktive Version;
- aktualisiert am;
- Öffnen;
- Installieren/Entfernen;
- Fork, falls erlaubt.

## 10. Sandbox und CSP

Den vorhandenen Artifact-/Sandpack-Renderer wiederverwenden, aber in einen standalonefähigen Wrapper kapseln.

Grundregeln:

- keine direkte Übergabe von Tokens/Credentials;
- keine freien Netzwerkziele;
- keine dynamische Paketinstallation;
- zentral erlaubte Dependencies;
- kein Zugriff auf Parent-DOM;
- keine Top-Navigation;
- keine Popups, sofern nicht explizit benötigt;
- Größen-, Laufzeit- und Output-Limits;
- restriktive CSP;
- erlaubte `connect-src` ausschließlich zur LibreChat Artifact Bridge;
- `frame-ancestors` abhängig von Embed-Konfiguration;
- `postMessage` nur mit exakter Origin-Prüfung.

## 11. MCP Bridge

### 11.1 Ablauf

```text
Artifact iframe
→ window.libreChatApp.invokeTool(...)
→ Host validiert postMessage
→ Backend Tool-Endpoint
→ Session/User bestimmen
→ Tenant prüfen
→ App ACL prüfen
→ Version prüfen
→ App Tool-Allowlist prüfen
→ User-Zugriff auf MCP-Server/Tool prüfen
→ bestehender MCPManager mit User-Kontext
→ per-user OAuth/OBO
→ Tool ausführen
→ Ergebnis begrenzen und sanitizen
→ Audit
→ Antwort an Artifact
```

### 11.2 Artifact API

```ts
window.libreChatApp.invokeTool({
  server: 'm365',
  tool: 'search_sharepoint',
  arguments: { query: '...' }
});
```

### 11.3 Auth-Regeln

Jeder Aufruf prüft:

1. gültige serverseitige Session;
2. Tenant-Zuordnung;
3. App-Status und Sichtbarkeit;
4. Viewer-Recht;
5. aktive oder angeforderte Version;
6. Tool in App-Allowlist;
7. MCP-Server für Benutzer verfügbar;
8. vorhandene User-OAuth/OBO-Verbindung;
9. Risikoklasse des Tools;
10. Rate-/Budget-Limits.

Artifact-Code erhält niemals:

- Access Token;
- Refresh Token;
- ID Token;
- Session Token;
- Client Secret;
- MCP Credential;
- Provider-Key;
- LiteLLM-Key.

### 11.4 HITL

Tool-Risikoklassen:

```text
read        → direkt, wenn erlaubt
write       → Bestätigung mit Parametervorschau
destructive → hervorgehobene Bestätigung mit genauer Auswirkung
```

Ablehnung darf den Tool-Call nicht ausführen. Bestätigung und Ablehnung werden auditiert.

## 12. Public und Embed

- `public-view` und `public-execute` getrennt behandeln;
- v1 erlaubt optional `public-view` für statische Darstellung;
- v1 erlaubt kein anonymes `public-execute`;
- nicht angemeldete Besucher erhalten bei Tool-Aufruf eine Login-Aufforderung;
- öffentliche Freigabe muss tenantweit deaktivierbar sein;
- öffentliche App darf keine internen Daten serverseitig vorladen.

## 13. Audit Events

```text
artifact_app.created
artifact_app.updated
artifact_app.submitted
artifact_app.approved
artifact_app.rejected
artifact_app.published
artifact_app.suspended
artifact_app.archived
artifact_app.forked
artifact_app.embedded

artifact_version.created
artifact_version.released
artifact_version.activated
artifact_version.withdrawn

artifact_acl.granted
artifact_acl.updated
artifact_acl.revoked

artifact_tool.requested
artifact_tool.confirmed
artifact_tool.rejected
artifact_tool.completed
artifact_tool.failed
artifact_tool.denied
```

Audit-Einträge dürfen keine Tokens, Secrets oder unnötigen Tool-Outputs enthalten.

## 14. Export

Späteres Arbeitspaket innerhalb dieses Plans:

```text
artifact-app.zip
├── manifest.json
├── source/
├── README.md
└── checksums.json
```

Nicht exportieren:

- ACLs;
- User-Informationen;
- Tokens;
- Secrets;
- MCP-Credentials;
- Session-Daten;
- interne Audit-Historie.

SCM-Synchronisierung bleibt außerhalb von v1.

## 15. Threat Model

Mindestens berücksichtigen:

- Stored und Reflected XSS;
- Sandbox Escape;
- Parent-DOM-Zugriff;
- Token-/Credential-Exfiltration;
- beliebige MCP-Server oder Header;
- SSRF;
- Cross-Tenant-IDOR;
- Manipulation von App-/Version-IDs;
- Rechteentzug während einer offenen Session;
- Tool Confusion;
- Prompt Injection über Tool-Outputs;
- Replay von Tool-Aufrufen;
- anonyme Tool-Ausführung;
- Editor erweitert eigene Rechte;
- Fork übernimmt fremde Credentials;
- Dependency Supply Chain;
- DoS durch Endlosschleifen, große Payloads oder Outputs;
- Clickjacking;
- gefälschte `postMessage`-Origins;
- Leakage über Logs, Fehler und Telemetrie.

## 16. Arbeitspakete

### WP0 – Repository-Erkundung und ADR

- tatsächliche Artifact-Datenstruktur lokalisieren;
- Renderer und Sandpack-Integration lokalisieren;
- Shared-Link-, Agent-Marketplace-, ACL-, Audit-, MCP- und HITL-Muster dokumentieren;
- konkrete Dateiliste in diesem Plan ergänzen;
- ADR für Snapshot-Speicherung;
- ADR für MCP Bridge;
- kein Produktivcode.

### WP1 – Persistenz

- `ArtifactApp`- und `ArtifactVersion`-Schema;
- Models und DB-Methoden;
- Indizes;
- Tenant-Isolation;
- atomare Erstellung;
- Migration;
- Unit-Tests.

### WP2 – ACL und Capabilities

- `ARTIFACT_APP` ResourceType;
- Capability-Mapping;
- Owner/Editor/Viewer;
- Benutzer-/Gruppen-/Rollenfreigabe;
- Admin-Capabilities;
- ACL- und Cross-Tenant-Tests.

### WP3 – Publishing API

- Quell-Artifact prüfen und extrahieren;
- vollständiger Snapshot;
- Hashing;
- App + Version 1;
- Owner-ACL;
- Audit;
- Integrationstests.

### WP4 – Versionierung

- Draft-Version;
- Release;
- Activate;
- Rollback;
- Withdraw;
- Versionshistorie;
- Immutability-Tests.

### WP5 – Standalone Viewer

- Route und Layout;
- Berechtigungszustände;
- aktive und explizite Version;
- Renderer-Wiederverwendung;
- Viewer-Tests.

### WP6 – Publish- und Sharing-UI

- Publish-Dialog;
- People Picker;
- ACL-Rollen;
- Sichtbarkeit;
- Tool-Policy;
- Review-Zusammenfassung;
- UI-Tests.

### WP7 – Embed und Sandbox

- Embed-Route;
- Sandbox;
- CSP;
- Origin-Regeln;
- Public View;
- Security-Tests.

### WP8 – Marketplace

- Apps-Tab;
- Suche und Filter;
- App-Details;
- Installieren/Entfernen;
- Öffnen/Fork;
- Risiko-/Kostenanzeige;
- E2E-Tests.

### WP9 – MCP Bridge Read-only

- Browser Bridge;
- Backend Invoke Endpoint;
- User Context;
- ACL und Tool-Allowlist;
- bestehender MCPManager;
- Output-Limits/Sanitizing;
- Rate Limits;
- per-user-OAuth-Tests.

### WP10 – HITL für Write/Destructive

- Tool-Risikometadaten;
- Bestätigungsdialog;
- Resume/Reject;
- Audit;
- E2E-Tests.

### WP11 – Fork

- unabhängige App und Version 1;
- eigener Owner;
- keine ACL/Credential-Übernahme;
- Fork-Tests.

### WP12 – Export

- Manifest;
- ZIP;
- Hashes;
- keine Secrets;
- Export-Tests.

### WP13 – Hardening

- Threat-Model-Review;
- Penetration-/Security-Tests;
- Performance und Limits;
- Migrationstests;
- Dokumentation;
- Admin-Kill-Switch;
- finaler Audit-Review.

## 17. Testmatrix

### Persistenz und Lifecycle

- App und Version werden atomar erstellt;
- Conversation-Löschung verändert App nicht;
- Message-/Artifact-Änderung verändert Release nicht;
- Source-Hash ist reproduzierbar;
- Release ist immutable;
- Rollback aktiviert ältere Version;
- suspended/archived verhindert Ausführung.

### ACL

- Owner verwaltet App, ACL und Tool-Policy;
- Editor erstellt Draft-Version;
- Viewer kann nur anzeigen/ausführen;
- fremder Benutzer erhält 403/404;
- Gruppenfreigabe funktioniert;
- Rechteentzug wirkt beim nächsten Request;
- Cross-Tenant-Zugriff wird verhindert;
- Viewer/Editor können eigene Rolle nicht erhöhen.

### Viewer und Embed

- Standalone Viewer zeigt keinen Chat;
- Embed zeigt keine Navigation;
- deaktiviertes Embed wird blockiert;
- private App ist nicht öffentlich erreichbar;
- CSP blockiert unerlaubte Verbindungen;
- iframe kann Parent-DOM nicht lesen;
- gefälschte postMessage-Origin wird ignoriert.

### MCP

- erlaubtes Read-Tool funktioniert;
- nicht erlaubtes Tool wird blockiert;
- unbekannter Server wird blockiert;
- User A verwendet User-A-OAuth;
- User B verwendet User-B-OAuth;
- kein Token erreicht Artifact-Code;
- gefälschte User-/Tenant-ID wird ignoriert;
- öffentliche anonyme App kann kein Tool ausführen;
- Schreibaktion benötigt Bestätigung;
- Reject verhindert Tool-Ausführung;
- App-Suspendierung verhindert weitere Tool-Calls.

### Fork

- Fork besitzt eigene App-ID und Versionen;
- Fork übernimmt keine ACLs;
- Fork übernimmt keine Credentials;
- spätere Änderungen am Original verändern Fork nicht.

### Security

- Stored XSS;
- Reflected XSS;
- IDOR App/Version;
- Cross-Tenant-Abfragen;
- SSRF;
- Header Injection;
- Token Leakage in Logs;
- Replay;
- große Payloads;
- Endlosschleifen;
- Dependency-Manipulation;
- Tool-Output-Injection.

## 18. Commit-Plan

```text
01 docs: document artifact app architecture and threat model
02 feat(data): add artifact app and version schemas
03 feat(acl): add artifact app permissions and capabilities
04 test(acl): cover artifact app tenant isolation
05 feat(api): publish detached artifact snapshots
06 test(api): cover artifact snapshot independence
07 feat(api): add artifact version lifecycle and rollback
08 feat(web): add standalone artifact app viewer
09 feat(web): add artifact publishing and sharing UI
10 feat(embed): add sandboxed artifact embed viewer
11 feat(marketplace): add artifact apps category
12 feat(mcp): add authenticated artifact tool bridge
13 feat(mcp): enforce app tool allowlists and limits
14 feat(hitl): require approval for write tools
15 test(mcp): cover per-user oauth and tool isolation
16 feat(apps): add artifact app forking
17 feat(export): add static artifact app export
18 security: harden artifact runtime and CSP
19 docs: add administration and user documentation
```

Jeder Commit muss möglichst eigenständig build- und testbar bleiben.

## 19. Reihenfolge der Coding-Sessions

Jede Session erhält nur ein Arbeitspaket und diesen Plan als Referenz.

```text
Session 1  → WP0
Session 2  → WP1
Session 3  → WP2
Session 4  → WP3
Session 5  → WP4
Session 6  → WP5
Session 7  → WP6
Session 8  → WP7
Session 9  → WP8
Session 10 → WP9
Session 11 → WP10
Session 12 → WP11
Session 13 → WP12
Session 14 → WP13
```

Regeln für jede Session:

- bestehende Planung nicht neu schreiben;
- nur das zugewiesene Arbeitspaket bearbeiten;
- sofort nach gezielter Codepfadprüfung implementieren;
- nicht nach Analyse stoppen;
- Tests vor Abschluss ausführen;
- geänderte Dateien und Befehle dokumentieren;
- keine Aufgabe als fertig markieren, wenn nur Dokumentation oder minimale Stubs entstanden sind.

## 20. Prompt-Vorlage pro Arbeitspaket

```text
Implementiere jetzt ausschließlich Arbeitspaket WP<N> aus PLAN.md.

Regeln:
- PLAN.md ist verbindlich und wird nicht neu geplant.
- Analysiere nur die für WP<N> relevanten Codepfade.
- Beginne anschließend sofort mit der Implementierung.
- Ändere keine fachfremden Bereiche.
- Verwende bestehende LibreChat-Muster und Workspace-Grenzen.
- Ergänze vollständige Tests.
- Führe Typecheck, relevante Tests und Linter aus.
- Beende die Aufgabe nicht nach Analyse oder mit reinen Stubs.

Fertig bedeutet:
1. alle Punkte von WP<N> implementiert;
2. Akzeptanztests erfüllt;
3. Tests erfolgreich;
4. geänderte Dateien aufgelistet;
5. ausgeführte Befehle aufgelistet;
6. verbleibende Risiken dokumentiert.
```

## 21. Abnahme

Vor Merge müssen mindestens folgende Nachweise vorliegen:

- vollständiger Build;
- Typecheck und Linter;
- Unit-, Integrations- und E2E-Tests;
- Cross-Tenant- und ACL-Testlauf;
- per-user-MCP-OAuth-Test mit zwei Benutzern;
- Test, dass keine Credentials im Browser oder in Logs erscheinen;
- Sandbox-/CSP-Test;
- Migration vorwärts und Rollback geprüft;
- dokumentierter Admin-Kill-Switch;
- dokumentierte bekannte Einschränkungen.
