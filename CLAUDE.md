# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development Environment
- **Start backend (development)**: `npm run backend:dev`
- **Start frontend (development)**: `npm run frontend:dev`
- **Start backend (production)**: `npm run backend`
- **Build frontend**: `npm run frontend`

### Testing
- **Run API tests**: `npm run test:api`
- **Run client tests**: `npm run test:client`
- **Run E2E tests**: `npm run e2e`
- **Run A11y tests**: `npm run e2e:a11y`

### Build Commands
- **Build all packages**: Use the individual package build commands in sequence:
  - `npm run build:data-provider`
  - `npm run build:api`
  - `npm run build:data-schemas`
  - `npm run build:client-package`

### Code Quality
- **Lint**: `npm run lint`
- **Lint with fix**: `npm run lint:fix`
- **Format**: `npm run format`

### User Management (Admin Commands)
- **Create user**: `npm run create-user`
- **Add balance**: `npm run add-balance`
- **List users**: `npm run list-users`
- **Ban user**: `npm run ban-user`

### Docker
- **Start deployed environment**: `npm run start:deployed`
- **Stop deployed environment**: `npm run stop:deployed`

## Architecture Overview

LibreChat is a full-stack application with a monorepo structure containing:

### Core Structure
- **Root**: Configuration, Docker setup, and orchestration scripts
- **`api/`**: Node.js/Express backend with MongoDB integration
- **`client/`**: React frontend with Vite build system
- **`packages/`**: Shared libraries and utilities
  - `data-provider`: API client and data management
  - `data-schemas`: Shared schemas and models
  - `api`: Backend utilities and configurations
  - `client`: Shared UI components and themes

### Backend Architecture (`api/`)
- **Entry Point**: `api/server/index.js` - Express server setup with middleware
- **Controllers**: Handle HTTP requests and business logic
- **Models**: MongoDB schemas using Mongoose
- **Services**: Business logic layer including:
  - `AppService.js`: Core application service initialization
  - `ModelService.js`: AI model management
  - `AssistantService.js`: OpenAI Assistants integration
  - `MCP.js`: Model Context Protocol support
- **Middleware**: Authentication, rate limiting, validation
- **Routes**: RESTful API endpoints organized by feature
- **Clients**: AI provider integrations (`OpenAIClient`, `AnthropicClient`, `GoogleClient`)

### Frontend Architecture (`client/src/`)
- **Entry Point**: `main.jsx` - React app bootstrap
- **App.jsx**: Root component with providers (Recoil, React Query, Theme)
- **Routes**: React Router setup with protected routes
- **Components**: Reusable UI components organized by feature
- **Store**: Recoil atoms for state management
- **Hooks**: Custom React hooks for common functionality
- **Providers**: Context providers for cross-cutting concerns

### Key Integrations
- **AI Providers**: OpenAI, Anthropic (Claude), Google (Gemini), custom endpoints
- **Database**: MongoDB with Mongoose ODM
- **Search**: Meilisearch for conversation/message search
- **Authentication**: Passport.js with multiple strategies (JWT, OAuth, LDAP)
- **File Storage**: Support for local, S3, Firebase storage
- **Caching**: Redis for session management and rate limiting

### Configuration System
- **Environment Variables**: Defined in `.env` files
- **YAML Configuration**: `librechat.yaml` for custom endpoints, UI settings, and feature toggles
- **Docker**: Multi-service setup with MongoDB, Meilisearch, and vector database

### Special Features
- **Agents**: Custom AI agents with tools and capabilities
- **Assistants**: OpenAI Assistants API integration
- **MCP Servers**: Model Context Protocol for extensible tools
- **Code Artifacts**: Generative UI with React components
- **Multi-modal**: Image generation, file uploads, speech-to-text
- **Memory System**: User context and preference storage

## Development Guidelines

### Workspace Structure
This is a monorepo using npm workspaces. Always run commands from the root directory unless working on a specific package.

### Testing Strategy
- Backend tests use Jest with MongoDB memory server
- Frontend tests use Jest with React Testing Library
- E2E tests use Playwright
- Run tests before submitting changes

### Code Style
- ESLint configuration enforces consistent code style
- Prettier handles code formatting
- TypeScript is used in packages, JavaScript in legacy API code

### Environment Setup
- Copy `.env` examples and configure for your environment
- Use Docker Compose for local development with all services
- MongoDB, Meilisearch, and vector database are required dependencies

### Package Development
When working on shared packages:
1. Build the package: `cd packages/{package-name} && npm run build`
2. The built package will be available to other parts of the application
3. Frontend development server watches for package changes

### Key Configuration Files
- `librechat.yaml`: Main application configuration
- `docker-compose.yml`: Service orchestration
- `eslint.config.mjs`: Code quality rules
- Package-specific configs in each workspace

This codebase follows a microservices-oriented architecture within a monorepo, emphasizing modularity, extensibility, and support for multiple AI providers and deployment scenarios.