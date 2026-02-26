# Postiz Integration - Quick Reference Card

## 🚀 Quick Deploy

```bash
cd postiz-deployment
.\start.ps1
```

Then open: http://localhost:3000

---

## 📋 Phase D1 Checklist

- [ ] Deploy Postiz (docker compose up -d)
- [ ] Create admin account
- [ ] Connect 1+ social platform (LinkedIn or X)
- [ ] Generate API key
- [ ] Update LibreChat .env
- [ ] Test API

**Estimated time:** 40-50 minutes

---

## 🔧 Common Commands

```bash
# Start Postiz
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f postiz

# Stop Postiz
docker compose down

# Restart Postiz
docker compose restart postiz

# Test API
curl http://localhost:3000/api/health
```

---

## 🔑 LibreChat .env Configuration

Add these to your LibreChat `.env`:

```env
POSTIZ_API_URL=http://localhost:3000/api
POSTIZ_API_KEY=<get_from_postiz_settings>
POSTIZ_WEBHOOK_SECRET=<generate_random_32_chars>
```

Generate webhook secret (PowerShell):
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## 🌐 Social Platform OAuth URLs

**LinkedIn:**
- Developer Portal: https://www.linkedin.com/developers/apps
- Callback: `http://localhost:3000/api/auth/linkedin/callback`

**X (Twitter):**
- Developer Portal: https://developer.twitter.com/en/portal/dashboard
- Callback: `http://localhost:3000/api/auth/twitter/callback`

**Instagram:**
- Developer Portal: https://developers.facebook.com/apps
- Callback: `http://localhost:3000/api/auth/instagram/callback`

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `POSTIZ_DEPLOYMENT_GUIDE.md` | Complete step-by-step deployment guide |
| `POSTIZ_PHASE_D1_CHECKLIST.md` | Interactive checklist for Phase D1 |
| `POSTIZ_D1_SETUP_SUMMARY.md` | Overview of what was created |
| `POSTIZ_INTEGRATION_PLAN.md` | Full integration plan (all phases) |
| `postiz-deployment/README.md` | Quick reference for deployment |

---

## 🎯 Current Phase

**Phase D1:** Postiz Setup & Configuration  
**Status:** 🔄 Ready for Deployment  
**Next:** Phase D2 - User Account Connection Flow

---

## ✅ Phase D1 Success Criteria

Phase D1 is complete when:
- ✅ Postiz running (3 containers healthy)
- ✅ Admin account created
- ✅ 1+ social platform connected
- ✅ Test post successful
- ✅ API key generated
- ✅ LibreChat .env updated
- ✅ API test passes

---

## 🆘 Troubleshooting

**Containers won't start:**
```bash
docker compose logs postiz
docker compose restart
```

**Can't access UI:**
- Check: http://127.0.0.1:3000
- Check firewall
- Check logs: `docker compose logs -f postiz`

**Social platform connection fails:**
- Verify OAuth credentials
- Check redirect URLs match exactly
- Ensure app in development mode

**API key doesn't work:**
- Verify no extra spaces
- Check format: `postiz_live_...`
- Regenerate if needed

---

## 📞 Support Resources

- Postiz Docs: https://docs.postiz.com
- Postiz GitHub: https://github.com/gitroomhq/postiz-app
- Docker Docs: https://docs.docker.com

---

## 🔄 Implementation Phases

| Phase | Status | Duration |
|-------|--------|----------|
| D1: Postiz Setup | 🔄 IN PROGRESS | 2-3 days |
| D2: User Accounts | ⏳ PENDING | 3-4 days |
| D3: n8n Integration | ⏳ PENDING | 2-3 days |
| D4: Backend | ⏳ PENDING | 3-4 days |
| D5: Frontend | ⏳ PENDING | 3-4 days |
| D6: Testing | ⏳ PENDING | 2-3 days |

**Total:** 15-21 days

---

*Last updated: 2026-02-19*
