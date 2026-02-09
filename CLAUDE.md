# CLAUDE.md — Ground Zero Project Context

## Project Overview
Ground Zero (ground0.io) is a multi-model AI SaaS platform with chat, document generation (Excel/PPT/Word/PDF), image/video creation, and MCP integrations (Gmail/Outlook/Drive/Calendar). Built on LibreChat (open-source fork).

## Company
- **Legal Entity:** Ground Zero GmbH
- **CEO:** Mustapha Nada (mnada@ground0.io)
- **Address:** Lautenschlägerstraße 10, 80999 Munich, Germany
- **VAT:** DE361241605
- **Domain:** ground0.io

## Brand Identity (FINALIZED)
- **Primary Wordmark:** `$ ground_zero█` (Space Mono Bold, blinking cursor)
- **Icon Mark:** `$gz` lowercase in rounded square (always include the $)
- **Circle Mark:** `$gz` in circle (for profile pics, Gmail org)
- **Color Palette:** Strictly monochrome — #0A0A0A (black) and #FFFFFF (white). NO accent colors in brand.
- **Typography:** Space Mono (logo, code, mono UI) + DM Sans (body, UI labels)
- **Slogan:** "The ground where your creativity begins"
- **DO:** Always include $ in icon mark, keep monochrome, use Space Mono
- **DON'T:** Use gz without $, add colors to logo, use uppercase $GZ, remove underscore from ground_zero

## Code & Commit Rules
- **NEVER** mention Claude, AI, or any AI assistant in code, comments, commit messages, or PR descriptions
- **NO** `Co-Authored-By` lines referencing AI in commits
- **NO** "Generated with Claude Code" or similar attribution in PRs, code comments, or documentation
- All work should appear as if written by the human developer

## Architecture Decisions (LOCKED)
- **Foundation:** LibreChat fork (musnada/ground0 on GitHub)
- **Cloud:** GCP — Cloud Run (serverless containers), NOT Kubernetes
- **Database:** PostgreSQL + pgvector on Cloud SQL
- **Search:** MeiliSearch
- **Cache:** Redis (Memorystore)
- **Storage:** Cloud Storage
- **Auth:** Firebase Auth
- **Payments:** Lemon Squeezy (Merchant of Record, 5% + $0.50/txn)
- **CRM:** HubSpot Free
- **Monitoring:** Grafana + Sentry + Better Uptime
- **CDN/WAF:** Cloudflare (Free plan)
- **CI/CD:** GitHub Actions (NOT Argo CD — may migrate to GKE + Argo at 200+ users)
- **Support Agent:** Fully custom with Claude Agent SDK (no Chatwoot/Intercom)
- **Region:** europe-west1 (Belgium)

## Pricing Model — Credit-Based (FINALIZED)
Uses **model tiers**, not specific model names (future-proof):

### Tiers
| Tier | Monthly | Annual | Credits/Mo | $/Credit |
|------|---------|--------|------------|----------|
| Free | $0 | $0 | 500/day (~15K) | N/A |
| Starter | $9.99 | $7.99 | 15,000 | $0.00067 |
| Pro | $24.99 | $19.99 | 50,000 | $0.00050 |
| Business | $49.99 | $39.99 | 150,000 | $0.00033 |

### Credit Consumption (by tier, not model name)
- Budget chat: 1 credit
- Standard chat: 2 credits
- Premium chat: 3 credits
- Reasoning/Thinking: 5 credits
- Deep Research: 10 credits
- Standard image: 5 credits
- Premium image: 10 credits
- Video 5s: 30 credits, 15s: 75, 30s: 150
- Slides (10-slide): 25 credits
- Docs (Word/PDF): 10 credits
- Spreadsheet: 10 credits
- MCP action: 1 credit
- File upload: 0 credits

### Credit Packs (one-time, 90-day validity)
- $5 for 5K, $10 for 12K, $25 for 35K

### Key Advantage vs Genspark
- 60% cheaper entry price ($9.99 vs $24.99)
- 73% cheaper per credit
- 50% more credits at comparable tier
- Future-proof: models rotate into tiers, never locked to legacy

## GCP Setup (COMPLETED)
- **Project ID:** handy-droplet-486816-d1
- **Organization:** ground0.io (via Google Workspace)
- **Region:** europe-west1
- **Zone:** europe-west1-b
- **Artifact Registry:** ground0-images (europe-west1)
- **APIs Enabled:** Cloud Run, Cloud SQL, Cloud Storage, Redis, Secret Manager, Cloud Build, Artifact Registry, Compute Engine, VPC Access, Vertex AI, Cloud Resource Manager

## Cloudflare Setup (COMPLETED)
- Site: ground0.io — Active
- Nameservers: bayan.ns.cloudflare.com, princess.ns.cloudflare.com
- SSL: Full (strict)
- Google Workspace MX records configured
- DKIM + SPF + site verification TXT records set

## Local Dev Environment
- **Machine:** Mac (Apple Silicon)
- **IDE:** VS Code
- **Container Runtime:** Podman (NOT Docker) with dedicated `ground0` VM (4 CPUs, 8GB RAM, 50GB disk)
- **Compose:** podman-compose 1.5.0
- **Aliases:** `docker=podman`, `docker-compose=podman-compose`
- **VM Management:** `gz-start` alias to switch to ground0 VM, `gz-stop` to stop
- **Node.js:** Installed
- **Git:** 2.50.1
- **gcloud CLI:** Installed, authenticated as mnada@ground0.io

## GitHub Repository
- **Repo:** https://github.com/musnada/ground0 (fork of danny-avila/LibreChat)
- **Upstream:** https://github.com/danny-avila/LibreChat.git
- **Branches:** main, develop (active development on develop)
- **Pull upstream updates:** `git fetch upstream && git merge upstream/main`
- **Future repos:** ground0-docs (Python doc services), ground0-support (Claude SDK agent), ground0-infra (IaC)

## Current Status — Week 1 Progress
### ✅ Completed
- [x] GCP account + project created
- [x] Google Workspace active (mnada@ground0.io)
- [x] 10+ GCP APIs enabled
- [x] Region set (europe-west1)
- [x] Artifact Registry created
- [x] Cloudflare DNS active
- [x] MX + DKIM + SPF records configured
- [x] Podman + ground0 VM running
- [x] podman-compose installed
- [x] gcloud CLI authenticated
- [x] LibreChat forked as musnada/ground0
- [x] Cloned locally to ~/projects/ground0/ground0
- [x] Upstream remote added
- [x] develop branch created
- [x] VS Code extensions recommended

### 🔲 In Progress
- [ ] Copy .env.example → .env
- [ ] Generate secret keys (CREDS_KEY, CREDS_IV, JWT_SECRET, JWT_REFRESH_SECRET, MEILI_MASTER_KEY)
- [ ] Configure at least one AI provider key (start with Google Gemini free)
- [ ] Run `podman-compose up -d`
- [ ] Verify LibreChat running at localhost:3080
- [ ] First AI chat message working

### Next Steps (Week 2)
- [ ] Cloud SQL (PostgreSQL + pgvector) provisioning
- [ ] GCP Secret Manager — store production secrets
- [ ] Build Docker image, push to Artifact Registry
- [ ] Deploy to Cloud Run
- [ ] Custom domain mapping: ground0.io → Cloud Run via Cloudflare
- [ ] Monitoring: Better Uptime + Sentry + Grafana Cloud

## 14-Week Build Plan
1. **Week 1–3:** Foundation + Cloud Deploy (GCP, Cloudflare, LibreChat fork, Docker local, Cloud Run)
2. **Week 3–6:** Auth + Payments + Billing Portal (Firebase Auth, Lemon Squeezy, credit system, CRM)
3. **Week 6–8:** Custom UI + SEO Foundation (Genspark-style layout, SSG, metadata)
4. **Week 7–10:** Custom AI Support Agent (Claude SDK, RAG, 10 MCP tools, escalation)
5. **Week 9–12:** Doc/Media + MCP (Excel/PPT/Word/PDF services, Gmail/Drive integrations, programmatic SEO)
6. **Week 12–14:** Admin Dashboard + Launch (Product Hunt, HN, Reddit)

## Cost Targets
- **20 users:** $132–266/mo infra, $299/mo revenue → $13–147/mo profit
- **Break-even:** ~15 paid users
- **Scaling:** 200 users = $350–750/mo, 2000+ = $5K+/mo (migrate to GKE)

## Important Commands
```bash
# Start ground0 dev environment
gz-start

# Run LibreChat locally
cd ~/projects/ground0/ground0
podman-compose up -d

# View logs
podman-compose logs -f

# Stop
podman-compose down

# Pull LibreChat updates
git fetch upstream
git merge upstream/main

# Push to Artifact Registry
podman build -t europe-west1-docker.pkg.dev/handy-droplet-486816-d1/ground0-images/ground0-app .
podman push europe-west1-docker.pkg.dev/handy-droplet-486816-d1/ground0-images/ground0-app

# Deploy to Cloud Run
gcloud run deploy ground0-app \
  --image europe-west1-docker.pkg.dev/handy-droplet-486816-d1/ground0-images/ground0-app \
  --region europe-west1 \
  --allow-unauthenticated
```

## Files & Deliverables Created
- `ground0-blueprint-v3.2.docx` — Full 20-section product blueprint
- `ground-zero-brand-final.jsx` — Complete brand system (V3, 13 sections incl. web UI mockup)
- `ground0-gmail-profile.png` — 512×512 Gmail org picture (Space Mono Bold $gz)
- `gz-icon-signature.png` — 72px icon for email signature
- `ground0-email-signature.html` — HTML email signature (image-based $gz icon)
- `ground0-week1-guide.docx` — Step-by-step Week 1 implementation checklist
