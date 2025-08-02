# LibreChat Development Guide

## Troubleshooting Setup Issues

### MongoDB Port Conflict Issue

**Problem**: Backend fails with "wire version 6" error when MongoDB was working before.

**Cause**: Docker containers running older MongoDB versions conflict with local MongoDB.

**Solution**:
1. Check for MongoDB port conflicts:
   ```bash
   lsof -i :27017
   docker ps | grep mongo
   ```

2. Stop conflicting Docker MongoDB containers:
   ```bash
   docker stop web-mongo-1  # or whatever container name
   ```

3. Verify local MongoDB is accessible:
   ```bash
   mongosh --eval "db.version()"
   ```

4. Restart LibreChat backend:
   ```bash
   NODE_ENV=development node api/server/index.js
   ```

### Running LibreChat

**Prerequisites**: MongoDB, Meilisearch running via Homebrew

**Commands**:
```bash
# Build data provider (required)
npm run build:data-provider

# Start backend (port 3080)
npm run backend:dev

# Start frontend (port 3091) 
npm run frontend:dev

# Access application
open http://localhost:3091
```

**Port Information**:
- Frontend (Vite): `localhost:3091` 
- Backend API: `localhost:3080`

### Creating a User Account

Since we cleared the MongoDB database, you need to create a new user account via the registration page.

## Project Structure

- **Frontend**: `/client` - React app with Vite
- **Backend**: `/api` - Node.js API server
- **Packages**: `/packages` - Shared libraries

## Current Feature: Conversation Cost Tracking

**Status**: Implemented, ready for testing

**What was built**:
1. **Backend Services**:
   - `api/server/services/ModelPricing.js` - Comprehensive pricing configuration with historical support
   - `api/server/services/ConversationCost.js` - Cost calculation from transaction records
   - API endpoints in `api/server/routes/convos.js`:
     - `GET /api/convos/:id/cost` - Get cost for single conversation
     - `POST /api/convos/costs` - Batch get costs for multiple conversations

2. **Frontend Components**:
   - `client/src/data-provider/conversations.ts` - React Query hooks for fetching costs
   - `client/src/components/Chat/ConversationCost.tsx` - Minimal cost display component
   - Integrated into chat header with color-coded display
   - Auto-refreshes when new messages arrive

**Key Features**:
- Real-time cost updates as you chat
- Color-coded display (green < $0.01, yellow < $0.1, orange < $1, red > $1)  
- Tooltip shows breakdown: total cost, primary model, token count, last updated
- Historical pricing support for accurate cost calculation
- Support for all major models (OpenAI, Anthropic, Google, etc.)
- Handles cache tokens and reasoning tokens

**To Test**:
1. Start a conversation with any model
2. Look for the cost display (💰) in the header
3. Send messages and watch the cost update
4. Hover over the cost to see details

