# OpenRouter Quick Deployment Guide

**⚡ Rapid deployment reference for OpenRouter Native Provider**

---

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Set API key
export OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# 2. Validate setup
./scripts/validate-openrouter-deployment.sh

# 3. Deploy
npm run start:deployed  # Docker
# OR
NODE_ENV=production npm run backend  # NPM
```

---

## 📋 Pre-Flight Checklist

```bash
# Quick validation (run all at once)
echo "Checking OpenRouter deployment readiness..."
[ -z "$OPENROUTER_API_KEY" ] && echo "❌ API key not set" || echo "✅ API key set"
curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENROUTER_API_KEY" -o /dev/null && echo "✅ API key valid" || echo "❌ API key invalid"
[ -f .env ] && echo "✅ .env exists" || echo "❌ .env missing"
grep -q "openrouter" librechat.yaml 2>/dev/null && echo "⚠️  Remove YAML config" || echo "✅ No YAML conflict"
```

---

## 🔧 Essential Commands

### Environment Setup
```bash
# Add to .env
echo "OPENROUTER_API_KEY=sk-or-v1-xxx" >> .env
echo "OPENROUTER_SITE_URL=https://myapp.com" >> .env
echo "OPENROUTER_SITE_NAME=MyApp" >> .env
```

### Testing
```bash
# Quick test suite
npm run test:api -- --testPathPattern=openrouter
npm run e2e -- --grep="OpenRouter"
npm run test:security
```

### Deployment
```bash
# Docker deployment
docker-compose build && docker-compose up -d

# NPM deployment
npm ci --production
NODE_ENV=production npm run backend

# Verify deployment
curl http://localhost:3080/health
```

### Monitoring
```bash
# Check logs
docker logs librechat --tail 50 | grep -i openrouter

# Check credits
curl http://localhost:3080/api/openrouter/credits \
  -H "Authorization: Bearer $JWT_TOKEN"

# Test chat
curl -X POST http://localhost:3080/api/openrouter/chat/completions \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"test"}]}'
```

---

## 🔥 Emergency Procedures

### Rollback (< 2 minutes)
```bash
# 1. Stop current deployment
docker-compose down  # or: pm2 stop all

# 2. Restore backup
cp .env.backup .env

# 3. Restart previous version
git checkout <previous-tag>
npm install
docker-compose up -d
```

### Disable OpenRouter (Temporary)
```bash
# Comment out in .env
sed -i 's/^OPENROUTER_API_KEY/#OPENROUTER_API_KEY/' .env

# Restart
docker-compose restart
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=openrouter:*
export LOG_LEVEL=debug

# View detailed logs
docker logs librechat -f 2>&1 | tee debug.log
```

---

## 🐛 Common Issues & Fixes

| Issue | Quick Fix |
|-------|-----------|
| **API key error** | `echo $OPENROUTER_API_KEY \| grep "^sk-or-"` |
| **Models not loading** | `curl http://localhost:3080/api/openrouter/models?force=true` |
| **Credits not showing** | Check key permissions at openrouter.ai/dashboard |
| **Agent not working** | Clear cache: `docker-compose restart` |
| **Rate limiting** | Wait 60s, retry with exponential backoff |
| **Container not starting** | `docker-compose logs \| tail -50` |

---

## 📊 Health Check Matrix

```bash
# Run complete health check
echo "=== OpenRouter Health Check ==="
curl -s http://localhost:3080/health > /dev/null && echo "✅ App running" || echo "❌ App down"
curl -s http://localhost:3080/api/openrouter/models -H "Authorization: Bearer $JWT" > /dev/null && echo "✅ Models API" || echo "❌ Models API"
curl -s http://localhost:3080/api/openrouter/credits -H "Authorization: Bearer $JWT" > /dev/null && echo "✅ Credits API" || echo "❌ Credits API"
docker ps | grep -q librechat && echo "✅ Container running" || echo "⚠️  Container not running"
```

---

## 📞 Escalation Path

### Level 1: Self-Service (0-5 min)
1. Run validation script
2. Check logs
3. Restart services

### Level 2: Team Support (5-15 min)
- Slack: #librechat-support
- Check GitHub issues
- Review documentation

### Level 3: Emergency (15+ min)
- On-call engineer: [Phone]
- Rollback to previous version
- Create incident ticket

---

## 🔗 Quick Links

- **Full Checklist**: [openrouter-deployment-checklist.md](./openrouter-deployment-checklist.md)
- **API Docs**: [/docs/api-reference/openrouter.md](../api-reference/openrouter.md)
- **Troubleshooting**: [/docs/troubleshooting/openrouter-faq.md](../troubleshooting/openrouter-faq.md)
- **Migration Guide**: [/docs/migration/openrouter-yaml-to-native.md](../migration/openrouter-yaml-to-native.md)

---

## 🎯 Success Criteria

Deployment is successful when:
- [ ] OpenRouter appears in provider dropdown
- [ ] Models load dynamically
- [ ] Credits display correctly
- [ ] Chat completions work
- [ ] Agents can use OpenRouter
- [ ] No errors in logs

---

## 📝 Post-Deploy Actions

```bash
# 1. Verify features
open http://localhost:3080
# Select OpenRouter, test chat

# 2. Monitor for 1 hour
watch -n 60 'docker logs librechat --tail 10 | grep -i error'

# 3. Document any issues
echo "$(date): Deployment complete" >> deployment.log
```

---

**🚨 Remember**: Always run `./scripts/validate-openrouter-deployment.sh` before deployment!

---

*Quick Deploy Guide v1.0 - Keep this handy during deployments*