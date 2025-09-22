# OpenRouter Native Provider Deployment Checklist

**Version:** 1.0.0
**Last Updated:** 2024
**Integration:** OpenRouter Native Provider for LibreChat

---

## Pre-Deployment Phase

### 1. Environment Setup Requirements

#### 1.1 Environment Variables
- [ ] `OPENROUTER_API_KEY` is set in `.env` file
  ```bash
  # Verify format (must start with sk-or-)
  echo $OPENROUTER_API_KEY | grep "^sk-or-" || echo "ERROR: Invalid key format"
  ```
- [ ] Optional variables configured (if needed):
  - [ ] `OPENROUTER_SITE_URL` (default: https://localhost:3080)
  - [ ] `OPENROUTER_SITE_NAME` (default: LibreChat)
  - [ ] `OPENROUTER_CACHE_TTL_CREDITS` (default: 300000)
  - [ ] `OPENROUTER_CACHE_TTL_MODELS` (default: 3600000)

#### 1.2 API Key Validation
- [ ] Test OpenRouter API key directly:
  ```bash
  curl https://openrouter.ai/api/v1/models \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" | jq '.data[0].id'
  # Expected: Model ID output (e.g., "openai/gpt-4")
  ```
- [ ] Verify credits endpoint access:
  ```bash
  curl https://openrouter.ai/api/v1/credits \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.total_credits'
  # Expected: Numeric credit balance
  ```

#### 1.3 Configuration Backup
- [ ] Backup existing configuration:
  ```bash
  cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
  cp librechat.yaml librechat.yaml.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
  ```
- [ ] Document current provider settings
- [ ] Export current database (if applicable)

#### 1.4 Dependency Updates
- [ ] Update npm dependencies:
  ```bash
  npm update
  npm audit fix
  ```
- [ ] Verify Node.js version (18.x or 20.x required):
  ```bash
  node --version
  ```
- [ ] Check Docker version (if using Docker):
  ```bash
  docker --version
  docker-compose --version
  ```

### 2. Migration Preparation (if applicable)

#### 2.1 YAML Configuration Check
- [ ] Check for existing OpenRouter YAML config:
  ```bash
  grep -i "openrouter" librechat.yaml 2>/dev/null || echo "No YAML config found (good!)"
  ```
- [ ] If found, remove or comment out OpenRouter sections
- [ ] Document any custom settings for migration

#### 2.2 Database Preparation
- [ ] Run database migrations (if any):
  ```bash
  npm run migrate:deploy
  ```
- [ ] Verify database connectivity
- [ ] Create database backup

---

## Testing Phase

### 3. Unit Tests

#### 3.1 OpenRouter Client Tests
- [ ] Run OpenRouter client unit tests:
  ```bash
  npm run test:api -- --testPathPattern=OpenRouterClient
  # Expected: All tests pass
  ```
- [ ] Verify test coverage:
  ```bash
  npm run test:api -- --coverage --testPathPattern=OpenRouterClient
  # Expected: >90% coverage
  ```

#### 3.2 Service Layer Tests
- [ ] Test OpenRouter service:
  ```bash
  npm run test:api -- --testPathPattern=openrouter/service
  # Expected: All tests pass
  ```
- [ ] Verify caching functionality
- [ ] Check error handling

### 4. Integration Tests

#### 4.1 API Endpoint Tests
- [ ] Test chat completions endpoint:
  ```bash
  npm run test:api -- --testPathPattern=openrouter.test
  # Expected: All tests pass
  ```
- [ ] Test credits endpoint
- [ ] Test models endpoint
- [ ] Verify rate limiting

#### 4.2 Authentication Tests
- [ ] Test with valid API key
- [ ] Test with invalid API key
- [ ] Test with missing API key
- [ ] Verify JWT authentication

### 5. End-to-End Tests

#### 5.1 UI Tests
- [ ] Run E2E tests for OpenRouter:
  ```bash
  npm run e2e -- --grep="OpenRouter"
  # Expected: All tests pass
  ```
- [ ] Test provider selection
- [ ] Test model dropdown
- [ ] Test chat functionality
- [ ] Test credits display

#### 5.2 Agent Compatibility Tests
- [ ] Create test agent with OpenRouter
- [ ] Verify agent saves correctly
- [ ] Test agent chat functionality
- [ ] Confirm fallback chains work

### 6. Security Tests

#### 6.1 API Key Security
- [ ] Run security tests:
  ```bash
  npm run test:security
  # Expected: All tests pass
  ```
- [ ] Verify API keys not in logs:
  ```bash
  grep -r "sk-or-" logs/ 2>/dev/null && echo "WARNING: API keys found in logs!" || echo "✓ No API keys in logs"
  ```
- [ ] Check API key masking in responses
- [ ] Verify environment variable validation

#### 6.2 Input Validation
- [ ] Test malformed requests
- [ ] Test injection attempts
- [ ] Verify rate limiting
- [ ] Check CORS configuration

### 7. Performance Tests

#### 7.1 Load Testing
- [ ] Test concurrent requests
- [ ] Verify caching reduces API calls
- [ ] Check response times
- [ ] Monitor memory usage

#### 7.2 Stress Testing
- [ ] Test with maximum fallback chain
- [ ] Test rapid provider switching
- [ ] Verify error recovery
- [ ] Check resource cleanup

---

## Deployment Execution

### 8. Build Process

#### 8.1 Frontend Build
- [ ] Build frontend with OpenRouter support:
  ```bash
  npm run build:data-provider
  npm run build:client-package
  npm run frontend
  # Expected: Build completes without errors
  ```
- [ ] Verify build artifacts
- [ ] Check bundle sizes

#### 8.2 Backend Preparation
- [ ] Lint code:
  ```bash
  npm run lint
  # Expected: No errors
  ```
- [ ] Format code:
  ```bash
  npm run format:fix
  ```
- [ ] Generate documentation

### 9. Deployment Method Selection

Choose ONE deployment method:

#### 9.1 Docker Deployment
- [ ] Build Docker image:
  ```bash
  docker-compose build
  # Expected: Build successful
  ```
- [ ] Start services:
  ```bash
  npm run start:deployed
  # Or: docker-compose -f deploy-compose.yml up -d
  ```
- [ ] Verify containers running:
  ```bash
  docker ps | grep librechat
  ```

#### 9.2 NPM Deployment
- [ ] Install production dependencies:
  ```bash
  NODE_ENV=production npm ci
  ```
- [ ] Start backend:
  ```bash
  NODE_ENV=production npm run backend
  ```
- [ ] Verify process running:
  ```bash
  ps aux | grep node | grep librechat
  ```

#### 9.3 Cloud Deployment
- [ ] Push to deployment branch:
  ```bash
  git push origin main:production
  ```
- [ ] Trigger CI/CD pipeline
- [ ] Monitor deployment logs
- [ ] Verify deployment status

---

## Post-Deployment Verification

### 10. Health Checks

#### 10.1 Service Health
- [ ] Check application health:
  ```bash
  curl http://localhost:3080/health
  # Expected: {"status":"ok"}
  ```
- [ ] Verify OpenRouter initialization in logs:
  ```bash
  docker logs librechat 2>&1 | grep -i "openrouter.*initialized"
  # Expected: "[OpenRouter] Provider initialized successfully"
  ```

#### 10.2 Feature Verification
- [ ] OpenRouter appears in provider dropdown
- [ ] Models load when selected
- [ ] Credits display correctly
- [ ] Chat completions work
- [ ] Streaming responses work

### 11. Integration Testing

#### 11.1 Agent System
- [ ] Create new agent with OpenRouter
- [ ] Test agent with various models
- [ ] Verify fallback chains
- [ ] Test Auto Router

#### 11.2 API Testing
- [ ] Test via cURL:
  ```bash
  curl -X POST http://localhost:3080/api/openrouter/chat/completions \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"Test"}]}'
  # Expected: Valid response
  ```

### 12. Monitoring Setup

#### 12.1 Logging
- [ ] Verify logging configured:
  ```bash
  tail -f logs/librechat.log | grep -i openrouter
  ```
- [ ] Set up log rotation
- [ ] Configure error alerting

#### 12.2 Metrics
- [ ] Monitor API call rates
- [ ] Track credit usage
- [ ] Set up usage alerts
- [ ] Configure performance monitoring

---

## Rollback Procedures

### 13. Rollback Plan

#### 13.1 Immediate Rollback
If critical issues occur:
```bash
# Stop current deployment
npm run stop:deployed

# Restore configuration
cp .env.backup.<timestamp> .env
cp librechat.yaml.backup.<timestamp> librechat.yaml

# Restart previous version
git checkout <previous-version-tag>
npm install
npm run start:deployed
```

#### 13.2 Partial Rollback
- [ ] Disable OpenRouter in UI (temporary)
- [ ] Revert to YAML configuration (if needed)
- [ ] Switch to fallback provider

#### 13.3 Data Recovery
- [ ] Restore database backup (if needed)
- [ ] Recover conversation history
- [ ] Restore user settings

---

## Sign-off

### 14. Deployment Approval

| Role | Name | Signature | Date | Time |
|------|------|-----------|------|------|
| Developer | _________ | _________ | ___/___/___ | ___:___ |
| QA Tester | _________ | _________ | ___/___/___ | ___:___ |
| DevOps | _________ | _________ | ___/___/___ | ___:___ |
| Product Owner | _________ | _________ | ___/___/___ | ___:___ |

### 15. Post-Deployment Notes

**Issues Encountered:**
```
[Document any issues and resolutions]
```

**Performance Metrics:**
- API Response Time: _____ ms
- Credits API Cache Hit Rate: _____ %
- Models Cache Hit Rate: _____ %
- Error Rate: _____ %

**Next Steps:**
- [ ] Monitor for 24 hours
- [ ] Collect user feedback
- [ ] Plan optimization phase
- [ ] Update documentation

---

## Appendix A: Quick Commands Reference

```bash
# Verify OpenRouter setup
curl http://localhost:3080/api/openrouter/models -H "Authorization: Bearer $JWT"

# Check credits
curl http://localhost:3080/api/openrouter/credits -H "Authorization: Bearer $JWT"

# Test chat
curl -X POST http://localhost:3080/api/openrouter/chat/completions \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'

# View logs
docker logs librechat --tail 100 | grep -i openrouter

# Restart services
docker-compose restart

# Emergency stop
docker-compose down
```

## Appendix B: Common Issues

| Issue | Solution |
|-------|----------|
| API key not working | Verify format starts with `sk-or-`, check for spaces |
| Models not loading | Clear cache, check network, verify API key permissions |
| Credits not showing | Ensure credits permission on API key |
| Agent not working | Restart application, clear browser cache |
| Rate limiting | Implement exponential backoff, check limits |

## Appendix C: Contact Information

**Internal Contacts:**
- Development Team: dev-team@company.com
- DevOps: devops@company.com
- On-call: +1-XXX-XXX-XXXX

**External Support:**
- LibreChat Discord: https://discord.librechat.ai
- OpenRouter Support: support@openrouter.ai
- GitHub Issues: https://github.com/danny-avila/LibreChat/issues

---

**Document Version:** 1.0.0
**Last Review:** [Date]
**Next Review:** [Date + 30 days]