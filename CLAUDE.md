# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat is an open-source AI chat platform supporting multiple AI providers (Anthropic, OpenAI, Google, etc.) with features like code interpreter, agents & tools, web search, and generative UI. It's a production-ready ChatGPT alternative with enterprise capabilities.

## Essential Commands

### Development
```bash
# Start backend development server (port 3080)
npm run backend:dev

# Start frontend development server (port 5173)
npm run frontend:dev

# Start both frontend and backend concurrently
npm run dev
```

### Testing
```bash
# Run backend tests
npm run test:api

# Run frontend tests  
npm run test:client

# Run specific test file
npm run test:api -- path/to/test.spec.js
npm run test:client -- path/to/test.spec.tsx

# Run E2E tests
npm run e2e
npm run e2e:headed  # With browser UI
```

### Code Quality
```bash
# Lint all code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Building
```bash
# Build frontend for production
npm run frontend

# Build all packages in dependency order
npm run build:packages
```

### Database Management
```bash
# Create new user
npm run create-user

# Reset user password
npm run reset-password

# List all users
npm run list-users
```

## Architecture & Code Structure

### Monorepo Organization
- **`/api`**: Express.js backend with AI provider integrations, authentication, and API endpoints
- **`/client`**: React frontend with Vite, TypeScript, Recoil/Jotai state management
- **`/packages/data-provider`**: Shared API client using React Query for data fetching
- **`/packages/data-schemas`**: Mongoose models and Zod schemas for type safety
- **`/packages/client`**: Reusable UI components and themes
- **`/e2e`**: Playwright E2E tests

### Key Backend Patterns
- **Endpoint Registration**: AI providers configured in `/api/server/services/Endpoints`
- **Authentication Flow**: Passport strategies in `/api/strategies`
- **Message Streaming**: Server-sent events (SSE) in `/api/server/routes/messages.js`
- **Plugin System**: Custom endpoints in `/api/server/routes/endpoints`
- **File Handling**: Multer middleware in `/api/server/middleware/uploadLimiters.js`

### Key Frontend Patterns
- **State Management**: 
  - Recoil atoms in `/client/src/recoil`
  - React Query hooks in `/packages/data-provider/src/queries`
- **Component Structure**: 
  - Route components in `/client/src/components/`
  - Shared UI in `/packages/client/src/components`
- **Chat Interface**: Main chat logic in `/client/src/components/Chat`
- **AI Provider Forms**: Dynamic endpoint forms in `/client/src/components/Endpoints`

### Configuration Files
- **Environment**: `.env` file (copy from `.env.example`)
- **Advanced Config**: `librechat.yaml` for endpoints, UI, rate limits
- **Docker**: `docker-compose.yml` for full stack deployment

### Database Schema Locations
- User models: `/packages/data-schemas/src/User.ts`
- Conversation models: `/packages/data-schemas/src/Conversation.ts`
- Message models: `/packages/data-schemas/src/Message.ts`
- Preset models: `/packages/data-schemas/src/Preset.ts`

### API Routes Structure
```
/api/server/routes/
├── auth/          # Authentication endpoints
├── endpoints/     # AI provider endpoints
├── messages.js    # Chat message handling
├── files/         # File upload/download
├── agents/        # Agent configurations
└── tools/         # Tool integrations
```

### Testing Approach
- Backend tests mirror source structure in `/api/test`
- Frontend tests colocated with components as `*.spec.tsx`
- E2E tests organized by feature in `/e2e/specs`
- Use MongoDB Memory Server for isolated backend tests
- Mock API responses with MSW for frontend tests

### Important Dependencies
- **AI SDKs**: @anthropic-ai/sdk, openai, @google/generative-ai
- **Database**: mongoose, @langchain/mongodb
- **Auth**: passport, passport-jwt, passport-oauth2
- **Real-time**: socket.io for events, SSE for streaming
- **File Processing**: multer, sharp, pdf-parse
- **Search**: meilisearch for full-text search

### Development Tips
- Hot reload works for both frontend (Vite) and backend (Nodemon)
- Use workspace commands to run scripts in specific packages: `npm run test -w api`
- Frontend proxy configured to forward API calls to backend on port 3080
- Redis required for rate limiting and caching features
- MeiliSearch optional but recommended for search functionality

### Testing Configuration
- **For testing, use custom ports to avoid conflicts:**
  - Backend testing server: port 3081 (instead of default 3080)
  - Frontend testing server: port 3091 (instead of default 5173)
- Kill any running background processes on default ports before testing
- Group Management feature requires data-schemas rebuild after schema changes: `npm run build:data-schemas`

## Test Login Credentials Policy
- Playwright tests use environment variables for login credentials
- Set TEST_EMAIL and TEST_PASSWORD environment variables when running tests
- Example: `TEST_EMAIL=admin@test.com TEST_PASSWORD=password123 npm run e2e`
- Use real login instead of mocking authentication in Playwright tests
- NEVER hardcode credentials in test files