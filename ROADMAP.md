# AtlasChat Feature Roadmap: 12-Month Strategic Build

**Objective**: Close gaps vs. Open WebUI and achieve enterprise AI workspace positioning through 5 strategic features over one year.

**Investment**: ~14-16 engineering weeks across 4 major epics (SCIM, OTel, URL browsing, Cloud integrations) + parallel dev story improvement.

**Timeline**: Q2 2026 → Q1 2027

**Go-Live Success Metrics**:
- ✅ SCIM deployed to 3+ enterprise customers (by Q2 close)
- ✅ OTel traces flowing to NewRelic/Datadog for 5+ customers (by Q3 close)
- ✅ URL-to-chat UX validated with 10+ users (by Q2 close)
- ✅ Google Drive + Slack integrations in beta (by Q4)
- ✅ Agent scaffolding reduces time-to-first-agent from 4 hrs → 30 min (by Q3 close)

---

## Q2 2026: FOUNDATION QUARTER

*Focus: Enterprise auth + UX polish*

### Epic 1: SCIM 2.0 Provisioning (4 weeks)

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Design SCIM 2.0 API** | Backend Lead | 3 days | None | OpenAPI spec for `/scim/v2/Users`, `/scim/v2/Groups` endpoints |
| **Implement SCIM User Create/Update/Delete** | Backend (1 eng) | 8 days | Design spec | Express endpoints + Mongoose schema updates; test against Okta/Azure AD test tenants |
| **Implement SCIM Group Sync + Membership** | Backend (1 eng) | 8 days | User endpoints done | `/scim/v2/Groups` endpoint; group → role mapping in AtlasChat ACL |
| **Okta/Azure AD Test Integration** | QA + Backend | 5 days | Group sync done | Test harnesses; can create/delete users and groups via SCIM, verify role assignment |
| **Documentation & Customer Pilot** | Product + Support | 4 days | All endpoints done | SCIM setup guide; onboard 1 customer for feedback |
| **Security Audit** | Security / Backend | 3 days | All done | SCIM rate limiting, auth validation, secret rotation docs |

**Acceptance Criteria**:
- [ ] Okta can provision/deprovision users via SCIM
- [ ] Azure AD can create groups and assign users
- [ ] Rate limiting preventing abuse
- [ ] Deprovisioning removes user access immediately
- [ ] Audit logs track SCIM operations

**Success Metric**: 1 enterprise customer live on SCIM provisioning; RFP response time improves from "custom solution needed" → "SCIM-ready"

---

### Epic 2: URL-to-Chat UX (3 weeks)

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Design URL Context Flow** | Product/UX | 2 days | None | Figma wireframes; URL input → fetch → system message → chat flow |
| **Build URL Input Component** | Frontend (1 eng) | 5 days | UX design | React component; URL validation; loading state; error handling |
| **Firecrawl / Web Search Integration** | Backend (1 eng) | 6 days | URL component done | Backend endpoint `/api/chat/url-context` that calls Firecrawl, extracts content, returns formatted markdown |
| **System Message Pipeline** | Backend (1 eng) | 4 days | Firecrawl done | Inject fetched URL content into system message; test with multiple URL types (blog, docs, product pages) |
| **Frontend Tests + Docs** | Frontend QA | 3 days | All done | E2E tests; user-facing docs; FAQ for supported URL types |

**Acceptance Criteria**:
- [ ] User pastes URL → content fetched & shown in chat context
- [ ] Works with news articles, docs, product pages, GitHub repos
- [ ] System message includes source attribution (cite the URL)
- [ ] Handles broken/auth-required URLs gracefully
- [ ] Performance: URL fetch ≤ 3 seconds median

**Success Metric**: "Chat about this article" UX matches ChatGPT/Claude.ai parity; in user interviews, rated as 8+/10 usability

---

### Epic 3: Agent Dev Story Phase 1 — Scaffolding (2 weeks)

*Parallel work; low-cost, high-impact*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Agent Create CLI Tool** | DevRel/Backend | 6 days | Existing agent schema | `atlaschat agent create my-agent --template weather` scaffolds a working agent in 30 seconds |
| **Agent Template Library** | DevRel | 4 days | CLI done | 3 templates: (1) web-search agent, (2) RAG agent, (3) tool-calling agent |
| **Tutorial: "Your First Agent in 30 Minutes"** | DevRel | 3 days | Templates done | Video + written guide; reduce time-to-first-agent from 4 hrs → 30 min |

**Success Metric**: Agent creation feedback loop reduced by 87%; tier-2 support volume for "how do I create an agent?" → 0

---

## Q3 2026: OBSERVABILITY & DEVELOPER EXPERIENCE

*Focus: Enterprise observability + clearer dev workflows*

### Epic 4: OpenTelemetry Stack (5 weeks)

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Design OTel Architecture** | Observability Eng | 3 days | None | Architecture doc: SDK choice (Node.js OTel SDK), instrumentation points (Express middleware, Mongoose queries, API calls), exporter targets (OTLP, Jaeger, Datadog, Azure Monitor) |
| **Implement OTel Node.js SDK** | Backend (1 eng) | 8 days | Arch design | Integrate `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` into `/api` startup; emit spans for HTTP requests, DB queries, external API calls |
| **Implement OTLP Exporter** | Backend (1 eng) | 6 days | SDK done | Ship traces to OTLP endpoint (configurable via `OTEL_EXPORTER_OTLP_ENDPOINT`); support Datadog, New Relic, Azure Monitor, GCP Cloud Trace |
| **Distributed Tracing Context** | Backend (1 eng) | 5 days | Exporter done | Ensure trace IDs flow across microservices; document for RAG API, custom sidecars, external agents |
| **Testing & Documentation** | QA + DevRel | 4 days | All instrumentation done | E2E tests with Jaeger in docker-compose; getting-started guide for Datadog/New Relic/Azure Monitor setup |
| **Customer Pilot** | Product + Support | 3 days | Docs done | Onboard 2 customers; collect feedback on trace verbosity, sampling |

**Acceptance Criteria**:
- [ ] Every HTTP request in traces visible with latency breakdown
- [ ] DB queries instrumented and visible in traces
- [ ] External API calls (OpenAI, etc.) show in traces with latency
- [ ] Trace data flows to at least 3 APM backends (Datadog tested, New Relic tested, Azure Monitor tested)
- [ ] Sampling configurable (e.g., 10% in prod, 100% in dev)
- [ ] No performance regression (tracers add <5% latency p99)

**Success Metric**: Enterprise security audits pass observability requirements; "where can I see request traces?" → "Your APM dashboard, native support"

---

### Epic 5: Agent Dev Story Phase 2 — MCP Workshop (3 weeks)

*Parallel to OTel; increases developer confidence*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **MCP Tool Template** | DevRel/Backend | 5 days | CLI tool from Q2 | `atlaschat agent create my-agent --mcp-tool` scaffolds a working MCP server |
| **MCP TypeScript SDK Helpers** | Backend (0.5 eng) | 5 days | MCP template done | Helper functions: `defineResourceLoader()`, `defineTool()`, `registerResourceServer()` reduce boilerplate by 70% |
| **Workshop Video: Building Your First MCP Tool** | DevRel | 5 days | Helpers done | 20-min video walkthrough; building a weather MCP tool from scratch |
| **MCP Registry / Marketplace Docs** | DevRel | 3 days | Workshop done | How to publish MCP tools to agent marketplace |

**Success Metric**: "Time to published first MCP tool" drops from 6 hrs → 45 min; 10+ community MCP tools in marketplace by year-end

---

## Q4 2026: CLOUD INTEGRATIONS & POLISH

*Focus: Enterprise integrations + ecosystem expansion*

### Epic 6: Cloud File Integrations — Phase 2 (4 weeks)

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Design Google Drive OAuth Flow** | Backend/Product | 2 days | None | OAuth 2.0 scopes; picker UX; Google Drive file context loading |
| **Implement Google Drive File Picker** | Frontend (1 eng) | 7 days | OAuth design | React component; authenticate via `google-auth-library`, load file picker, return file metadata |
| **Google Drive File Loader Service** | Backend (1 eng) | 6 days | File picker done | Load `.pdf`, `.doc`, `.txt` from Google Drive; convert to markdown; inject into message context (like SharePoint) |
| **Test with 5+ Cloud File Types** | QA | 4 days | Loader done | Test Google Docs → MD, Google Sheets → table, PDF, DOCX handling |
| **Documentation & Marketplace** | DevRel | 2 days | All done | Setup guide for Google Drive OAuth; list as supported integration |

**Acceptance Criteria**:
- [ ] User can pick Google Drive file in UI
- [ ] File content loaded and available in chat context
- [ ] Works with Docs, Sheets, PDFs, DOCX
- [ ] Respects Google Drive permissions (no over-fetching)

**Success Metric**: Enterprise teams can "chat about our Google Drive file" natively; no manual download/paste needed

---

### Epic 7: Slack Thread Context Integration (3 weeks)

*Lower priority but high-value for teams already on Slack*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Design Slack Thread Context Flow** | Product | 2 days | None | Flow: paste Slack thread URL → fetch thread messages → inject as chat context |
| **Slack OAuth & API Integration** | Backend (0.5 eng) | 5 days | Design done | Register with Slack; implement thread message fetching via `conversations.history` API |
| **Slack Thread Loader** | Backend (0.5 eng) | 4 days | OAuth done | Parse Slack thread URL; validate permissions; return messages formatted as chat context |
| **Frontend Integration** | Frontend (0.5 eng) | 3 days | Thread loader done | URL input recognizes Slack URLs; fetches and displays thread |
| **Testing & Docs** | QA + DevRel | 2 days | All done | E2E test with Slack workspace; documentation |

**Acceptance Criteria**:
- [ ] User pastes Slack thread URL
- [ ] Thread messages fetched and injected as context
- [ ] Respects Slack workspace permissions
- [ ] Works with public and private channels

**Success Metric**: Teams using both Slack and AtlasChat can "analyze this Slack discussion in AI" without manual export

---

## Q1 2027: HARDENING & ECOSYSTEM

*Focus: Polish, security, community engagement*

### Epic 8: Observability Expansion (2 weeks)

*Build on OTel foundation*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Custom Metrics for Business Logic** | Backend (0.5 eng) | 4 days | OTel from Q3 | Metrics: agents created/executed, RAG queries, file uploads, user activity; export to Prometheus |
| **Grafana Dashboard Template** | DevOps (0.5 eng) | 5 days | Custom metrics done | Pre-built Grafana dashboard; shows agent usage, RAG latency, system health |
| **Alert Rules Documentation** | DevOps (0.25 eng) | 2 days | Dashboard done | Runbooks; recommended alerts (high latency, error rate, quota usage) |

**Success Metric**: Ops teams can set up monitoring in <30 min with provided templates

---

### Epic 9: Security Hardening & Audit (2 weeks)

*Compliance-focused; support security reviews*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **SCIM Audit Log Compliance** | Security / Backend | 4 days | SCIM from Q2 | All user/group actions logged with actor, action, timestamp, result; queryable via `/api/audit-logs` |
| **Data Residency & Encryption Docs** | Security (0.5 eng) | 3 days | None | Runbook: how to configure encrypted persistence, network isolation, compliance with SOC2/ISO27001 |
| **Penetration Test Preparation** | Security (0.25 eng) | 3 days | SCIM, OTel, OAuth done | Threat model review; identify attack surface; document mitigations |

**Success Metric**: Can pass SOC2 Type II audit; respond to security questionnaires with confidence

---

### Epic 10: Developer Experience Polish (3 weeks)

*Finalize the dev story; reduce friction*

| Task | Owner | Duration | Dependency | Deliverable |
|------|-------|----------|-----------|------------|
| **Agent Scaffolding Enhancements** | DevRel/Backend | 5 days | Q3 scaffolding | Add more templates: RAG-on-docs, multi-step workflow, tool-chaining |
| **Unified Extension Architecture Doc** | DevRel | 4 days | MCP, agents, tools all done | Single source of truth: "When to use agents vs. tools vs. MCP vs. custom endpoints" |
| **TypeScript Type Safety for Agent/Tool Authoring** | Backend (0.5 eng) | 5 days | Extension doc done | Exported types for agent schema, tool definitions, MCP resource/tool interfaces; IDE autocomplete |
| **Community Agent Templates** | Community (bounty) | 3 days | Templates done | Post on GitHub; invite community to submit agent templates; curate top 5 |

**Success Metric**: New developers can publish first agent in <1 hour; 20+ community-submitted agent templates in marketplace

---

## RESOURCE & DEPENDENCY PLAN

### Team Allocation (Estimated 4-5 Full-Time Engineers)

| Role | Q2 | Q3 | Q4 | Q1 | Total |
|-----|-----|-----|-----|-----|-------|
| **Backend Lead** (SCIM, OTel, APIs) | 60% | 80% | 40% | 20% | 3.5 FTE months |
| **Backend Eng #1** (Auth, integrations) | 100% | 40% | 80% | 40% | 2.6 FTE months |
| **Backend Eng #2** (Observability, tracing) | 0% | 100% | 40% | 30% | 1.7 FTE months |
| **Frontend Eng** (URL input, UI, integrations) | 80% | 20% | 60% | 20% | 1.8 FTE months |
| **DevRel / DevOps** (Docs, templates, workshops) | 40% | 60% | 40% | 80% | 2.2 FTE months |
| **QA / Security** (Testing, audits, hardening) | 40% | 40% | 40% | 100% | 1.6 FTE months |

**Total Lift**: ~13 FTE months (~3 engineers for 4 quarters + fractional leads)

---

## DEPENDENCIES & SEQUENCING

```
Q2 Parallel Tracks:
  ├─ SCIM 2.0 (4 weeks) ────────────┐
  ├─ URL-to-Chat (3 weeks)          │
  └─ Agent CLI Scaffolding (2 wks)  │

Q3 (starts after Q2 stabilizes):
  ├─ OTel Stack (5 weeks) ──────────┐
  └─ MCP Dev Workshop (3 weeks)     │

Q4 (starts mid-Q3):
  ├─ Google Drive Integration (4 weeks)
  └─ Slack Thread Context (3 weeks)

Q1 2027 (polish & hardening):
  ├─ OTel Expansion & Alerting
  ├─ Security Hardening
  └─ Dev Experience Polish
```

**Critical Path**: SCIM → OTel → Security hardening (enterprise customers gate on these)

---

## SUCCESS METRICS BY QUARTER

### Q2 2026 Exit Criteria ✅
- [ ] SCIM provisioning live with 1+ customer
- [ ] URL-to-chat UX working and documented
- [ ] Agent CLI reducing onboarding time by 80%
- [ ] RFP response: "SCIM-ready enterprise platform" ✓

### Q3 2026 Exit Criteria ✅
- [ ] OTel traces flowing to APM backends for 3+ customers
- [ ] MCP dev story solid; 5+ community MCP tools published
- [ ] Security audit prep complete; no p0 vulnerabilities
- [ ] RFP response: "Enterprise observability & open dev ecosystem" ✓

### Q4 2026 Exit Criteria ✅
- [ ] Google Drive & Slack thread integration in beta
- [ ] Grafana dashboards & alert rules deployed
- [ ] Agent marketplace has 15+ community agents
- [ ] RFP response: "Cloud-connected enterprise AI workspace" ✓

### Q1 2027 Exit Criteria ✅
- [ ] SOC2 audit-ready; security questionnaires passing
- [ ] "Developer experience" becomes a competitive differentiator
- [ ] Business metrics: 
  - Enterprise deal velocity +40% (SCIM+OTel+Auth)
  - Community agent count: 30+
  - Developer NPS: 8+/10

---

## RISK & MITIGATION

| Risk | Severity | Mitigation |
|------|----------|-----------|
| SCIM customer needs custom group mapping logic | MEDIUM | Design extensibility upfront; allow Lua/custom matching rules in config |
| OTel causes performance regression in high-load deployments | HIGH | Implement sampling + async exporting; test with 1000+ concurrent users before ship |
| URL fetching hits abuse/rate-limiting from websites | MEDIUM | Implement backoff, user-agent rotation; add admin config for aggressive sites |
| Google Drive auth becomes a support bottleneck | LOW | Provide Terraform/Helm config templates; customer success automation |
| Resource constraints push timeline right | HIGH | Front-load SCIM+OTel (enterprise asks); defer Slack/Drive to Q1 if needed |

---

## GO/NO-GO GATES

| Gate | Trigger | Owner | Action |
|------|---------|-------|--------|
| **Q2 Checkpoint** (week 6) | SCIM design approved? | Backend Lead | Proceed to implementation or pivot design |
| **Q3 Checkpoint** (week 14) | OTel perf tests pass? | Observability Eng | Proceed to exporter integration or add performance sprint |
| **Q4 Checkpoint** (week 22) | Google Drive MVP works? | Backend Eng #1 | Proceed to Slack or extend Drive polish |
| **Q1 Go/No-Go** (week 30) | Security audit complete? | Security Lead | Ship 1.0 or extend hardening phase |

---

## ADDITIONAL RECOMMENDATIONS

### Quick Wins (Parallel, Low-Cost)

1. **Confluence Page Context Loader** (1 week) — Fetch Confluence pages and inject as chat context; for enterprise orgs using Confluence wikis
2. **Agent Version Control** (2 weeks) — Enable agents to have versions, rollback, change history; critical for production deployments
3. **RAG Document Lineage** (2 weeks) — Track which RAG documents were used in a response; transparency for enterprise users

### Post-Q1 2027 Roadmap

- **Multi-LLM Experiment Framework** — A/B test different models per agent; track performance, cost, latency
- **Custom Fine-Tuning Integration** — Allow users to train custom models on their chat history; bring your own fine-tuned endpoint
- **Workflow Automation** — IFTTT-style "trigger agent on event" (Slack message, scheduled time, webhook)
- **Audit Trail UI** — Visual dashboard for showing audit logs (login, SCIM events, agent executions, data access)

---

## CONCLUSION

This roadmap positions AtlasChat to **own the enterprise AI workspace category** by combining governance (SCIM, RBAC), observability, developer experience, and cloud-native integrations. The phased approach lets you ship value every quarter while building toward a comprehensive platform defensibility story.
