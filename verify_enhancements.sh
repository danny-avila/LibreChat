#!/bin/bash
# LibreChat Enhancement Verification Script
# Run from project root: bash verify_enhancements.sh

set -e

echo "═══════════════════════════════════════════════════════════"
echo "LibreChat v0.8.4 Enhancement Verification"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
SKIP="${YELLOW}⊘${NC}"

# Track issues
ISSUES=0

# 1. Check Redis Configuration
echo -n "1. Redis Configuration... "
if grep -q "REDIS_URL=redis://redis:6379" .env; then
    echo -e "$PASS Redis URL configured"
else
    echo -e "$FAIL Redis URL not configured"
    ISSUES=$((ISSUES + 1))
fi

echo -n "   Redis service in docker-compose... "
if grep -q "container_name: librechat-redis" docker-compose.override.yml; then
    echo -e "$PASS Redis service enabled"
else
    echo -e "$FAIL Redis service not in docker-compose"
    ISSUES=$((ISSUES + 1))
fi

# 2. Check Health Checks
echo ""
echo -n "2. Health Checks... "
if grep -q "healthcheck:" docker-compose.override.yml | head -1; then
    echo -e "$PASS Health checks configured"
    HEALTH_COUNT=$(grep -c "healthcheck:" docker-compose.override.yml)
    echo "   Found $HEALTH_COUNT health checks"
else
    echo -e "$FAIL No health checks found"
    ISSUES=$((ISSUES + 1))
fi

# 3. Check Resource Limits
echo ""
echo -n "3. Resource Limits... "
if grep -q "deploy:" docker-compose.override.yml; then
    echo -e "$PASS Resource limits configured"
    COUNT=$(grep -c "cpus:" docker-compose.override.yml)
    echo "   Found CPU limits in $COUNT services"
else
    echo -e "$FAIL Resource limits not configured"
    ISSUES=$((ISSUES + 1))
fi

# 4. Check Security Settings
echo ""
echo -n "4. Security Settings... "
if grep -q "SECURE_COOKIES=true" .env; then
    echo -e "$PASS Secure cookies enabled"
else
    echo -e "$FAIL Secure cookies not enabled"
    ISSUES=$((ISSUES + 1))
fi

echo -n "   JWT Expiration... "
if grep -q "JWT_EXPIRATION=" .env; then
    JWT_EXP=$(grep "JWT_EXPIRATION=" .env | cut -d'=' -f2)
    echo -e "$PASS JWT expiration set to: $JWT_EXP"
else
    echo -e "$FAIL JWT expiration not configured"
    ISSUES=$((ISSUES + 1))
fi

# 5. Check Language Support
echo ""
echo -n "5. Arabic Language Support... "
if [ -f "client/src/locales/ar/translation.json" ]; then
    echo -e "$PASS Arabic translation file exists"
    LINES=$(wc -l < client/src/locales/ar/translation.json)
    echo "   Translation file has $LINES lines"
    
    if [ "$LINES" -lt 100 ]; then
        echo -e "   ${YELLOW}Warning: Translation file seems small ($LINES lines)${NC}"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "$FAIL Arabic translation file not found"
    ISSUES=$((ISSUES + 1))
fi

# 6. Check Local Model Configuration
echo ""
echo -n "6. Local Model Configuration... "
if grep -q "LocalOllama\|LiteLLM" librechat.yaml; then
    echo -e "$PASS Local model endpoint configured"
    if grep -q "LocalOllama" librechat.yaml; then
        echo "   - Ollama endpoint found"
    fi
    if grep -q "LiteLLM" librechat.yaml; then
        echo "   - LiteLLM endpoint found"
    fi
else
    echo -e "$SKIP Local models not yet configured (optional)"
fi

# 7. Check LiteLLM Config File
echo ""
echo -n "7. LiteLLM Configuration File... "
if [ -f "litellm_config.yaml" ]; then
    echo -e "$PASS LiteLLM config file exists"
    if grep -q "model_list:" litellm_config.yaml; then
        MODEL_COUNT=$(grep -c "model_name:" litellm_config.yaml)
        echo "   Found $MODEL_COUNT model definitions"
    fi
else
    echo -e "$SKIP LiteLLM config file not found (optional)"
fi

# 8. Check Ollama Service
echo ""
echo -n "8. Ollama Service... "
if grep -q "image: ollama/ollama" docker-compose.override.yml; then
    echo -e "$PASS Ollama service configured"
else
    echo -e "$SKIP Ollama service not in override (commented or optional)"
fi

# 9. Check Documentation
echo ""
echo -n "9. Documentation... "
DOCS=0
[ -f "ENHANCEMENT_PLAN.md" ] && DOCS=$((DOCS + 1))
[ -f "SETUP_GUIDE.md" ] && DOCS=$((DOCS + 1))
[ -f "LIBRECHAT_YAML_ADDITIONS.md" ] && DOCS=$((DOCS + 1))

if [ "$DOCS" -eq 3 ]; then
    echo -e "$PASS All documentation files present"
else
    echo -e "$SKIP Documentation files: $DOCS/3 found"
fi

# 10. Check Cost Tracking
echo ""
echo -n "10. Cost Tracking... "
if grep -q "TRACK_TOKEN_USAGE=true" .env; then
    echo -e "$PASS Token usage tracking enabled"
else
    echo -e "$FAIL Token usage tracking not enabled"
    ISSUES=$((ISSUES + 1))
fi

if grep -q "ENABLE_COST_TRACKING=true" .env; then
    echo -e "    $PASS Cost tracking enabled"
else
    echo -e "    $FAIL Cost tracking not enabled"
    ISSUES=$((ISSUES + 1))
fi

# 11. Check Containers Status (if running)
echo ""
echo -n "11. Docker Container Status... "
if command -v docker-compose &> /dev/null; then
    STATUS=$(docker-compose ps 2>/dev/null | grep -c "Up" || echo "0")
    if [ "$STATUS" -gt 0 ]; then
        echo -e "$PASS Containers running: $STATUS/7"
        echo ""
        echo "   Container Status:"
        docker-compose ps --no-trunc 2>/dev/null | tail -n +2 | awk '{print "   - " $1 " (" $6 ")"}'
    else
        echo -e "$SKIP Containers not running"
    fi
else
    echo -e "$SKIP Docker not available in PATH"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✓ All core enhancements verified!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review SETUP_GUIDE.md for implementation details"
    echo "2. Restart containers: docker-compose restart"
    echo "3. Test Arabic support at http://localhost:3080"
    echo "4. Enable local models (Ollama/LiteLLM) - see SETUP_GUIDE.md"
else
    echo -e "${RED}✗ Found $ISSUES configuration issue(s)${NC}"
    echo ""
    echo "Please review and fix the items marked with ✗"
    echo "See SETUP_GUIDE.md for detailed instructions"
fi
echo "═══════════════════════════════════════════════════════════"
echo ""

exit $ISSUES
