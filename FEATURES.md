# Platform Features Documentation

This document provides a comprehensive overview of all features available in this LibreChat-based enterprise platform.

---

## 🎯 Core Platform Features

### 1. Multi-AI Provider System
- Support for multiple AI providers: OpenAI, Anthropic (Claude), Google Gemini, Azure OpenAI, AWS Bedrock
- Custom OpenAI-compatible API support
- Unified interface for switching between providers
- Per-conversation provider selection
- Model-specific configurations and parameters

### 2. Authentication & Authorization
- JWT token-based authentication with refresh tokens
- Local username/password authentication
- LDAP integration for enterprise environments
- OAuth2 social logins (Google, GitHub, Discord, Facebook, Apple)
- SAML SSO support
- Two-Factor Authentication (2FA) with backup codes
- Role-Based Access Control (RBAC) with fine-grained permissions
- User/Group/Role permission management

### 3. Conversation Management
- Full conversation CRUD operations (Create, Read, Update, Delete)
- Message branching and forking for exploring different conversation paths
- Message editing with history tracking
- Conversation search powered by Meilisearch
- Export/Import functionality (ChatGPT and Chatbot UI formats)
- Conversation tagging and categorization
- Bookmarks and presets for quick access
- Conversation sharing with granular access control

### 4. File Handling & Multimodal Support
- Multi-storage strategy (AWS S3, Firebase, Local filesystem, Azure Blob)
- Image upload and processing
- Document upload for RAG (Retrieval-Augmented Generation)
- Multimodal AI support (images with Claude, GPT-4o, Gemini)
- Image generation (DALL-E, Stable Diffusion, Flux)
- File citations in AI responses
- User avatar management

### 5. Agent System
- Agent marketplace for discovering and sharing custom agents
- Tool integration via Model Context Protocol (MCP)
- Code interpreter (Python, Node.js, Go, and more)
- File search with RAG capabilities
- n8n workflows as AI function tools
- Agent permissions and sharing controls

### 6. RAG (Retrieval-Augmented Generation)
- PostgreSQL with pgvector for vector storage
- Document embedding and indexing
- Semantic search capabilities
- Context retrieval for enhanced AI responses
- Separate RAG API service

### 7. Code Artifacts & Generative UI
- React component rendering with live preview
- HTML/CSS rendering in sandboxed iframes
- Mermaid diagram support
- Multi-language code execution

### 8. Prompt Library & Management
- Prompt creation and organization
- Prompt groups and categories
- Variable templates for dynamic prompts
- Sharing and permissions
- Prompt search and discovery

---

## 👔 Business-Specific Features

### 9. Profile System (Role-Based Dashboards)
Three distinct profile types with tailored interfaces:
- **CEO Profile**: Executive dashboard with strategic tools and company-wide visibility
- **Employee Profile**: Operational workspace for task and project management
- **Customer Profile**: Support ticket submission and project status tracking
- Profile-based access control and feature visibility

### 10. CEO Dashboard & Executive Features
- **KPI Statistics**: Budget tracking, spending analysis, active projects, profit margins
- **Project Management**: Company-wide project tracking and oversight
- **Financial Analytics**: AI-powered financial insights and company metrics
- **Strategic Workflow Execution**: Execute high-level business workflows
- **User Management Interface**: Manage employees, customers, and permissions
- **Report Generation**: AI-powered business reports and insights
- **Audit Management Access**: Full access to audit system
- **Orders Management**: 
  - View all signage orders across the company
  - Approve or reject orders
  - Assign orders to specific employees
  - Track payment status (paid/unpaid)
  - Filter orders by customer, status, or employee
  - Monitor order progress and completion

### 11. Employee Dashboard & Operational Features
- **Project Assignment**: View and manage assigned projects
- **Task Management**: Create, edit, delete, and assign tasks
- **Support Ticket Handling**: Respond to and resolve customer tickets
- **My Orders Queue**: 
  - View orders assigned specifically to them
  - Update order status (pending → printing → printed → delivered)
  - Track order details (customer info, type, copies, amount)
  - Manage personal workload and priorities
- **Document Generator Integration**: Access to document creation tools
- **Team Collaboration**: Coordinate with other team members

### 12. Customer Dashboard
- **Support Ticket Submission**: Create and track support requests
- **Project Status Monitoring**: View progress of customer projects
- **Document Access**: Access project-related documents
- **Self-Service Portal**: Find answers and resources independently

### 13. Signage Center / Print Management
- **Order Management System**: 
  - CEO view of all signage orders company-wide
  - Employee view of personally assigned orders
- **Order Assignment**: CEO can assign orders to specific employees
- **Order Status Tracking**: pending → printing → printed → delivered
- **Payment Tracking**: Track payments and reconciliation (paid/unpaid status)
- **Customer Information**: Manage customer details per order (name, email, ID)
- **PDF Builder Integration**: Backend integration for PDF generation
- **Approval Workflow**: 
  - CEO can approve or reject orders
  - Employees can update status of assigned orders
- **Order Types**: Support for print orders and buy orders
- **Order Details**: Track copies, total amount, amount paid, due dates
- **Filtering & Search**: Filter by customer, status, employee assignment

### 14. Audit Management System
- **Audit Session Tracking**: Track all audit sessions and reports
- **Report Editing**: Edit audit reports with version control
- **Approval Workflow**: Approve reports with email notifications
- **User Audit History**: View complete audit history per user
- **Health Check Monitoring**: Monitor audit platform API health
- **Advanced Filtering**: Filter by user, status, approval state
- **Feature-Gated**: CEO-only access with feature flag control

### 15. Social Media Automation
- **LinkedIn Integration (Direct API)**: 
  - Per-user OAuth authentication
  - Create posts on LinkedIn
  - Comment on posts
  - Reply to comments
  - View comments and engagement
  - Token auto-refresh
  - 100% FREE (no monthly costs)
- **Multi-Platform Support (Coming Soon)**:
  - Facebook, X/Twitter, Instagram (Direct OAuth integration planned)
  - TikTok, YouTube, Pinterest (Future platforms)
- **Social Draft Management**: 
  - AI-powered draft generation via n8n
  - Human-in-the-loop approval workflow
  - Platform-specific content optimization
  - Draft approval with platform selection
- **Per-User Account Connection**: Each user connects their own social accounts
- **Platform Status Tracking**: Monitor connection status for each platform

### 16. n8n Workflow Integration
- **External n8n Instance**: Integration with self-hosted or cloud n8n
- **Workflows as AI Tools**: Expose n8n workflows as function tools for AI
- **Workflow Loading**: Dynamic workflow metadata management
- **Tool Execution**: Execute workflows and handle results
- **Direct Webhooks**: Direct webhook endpoints for n8n integration
- **Profile-Based Access**: Control workflow access by profile type
- **Pre-built Workflows**:
  - Financial analytics
  - Company metrics
  - Task management
  - Support ticket automation
  - Document search

---

## 🔧 Administrative & Management Features

### 17. User Management
- User creation and invitation system
- User profile management
- Role assignment and modification
- User deactivation/deletion
- Password reset functionality
- User statistics and reporting
- Ban/unban user capabilities

### 18. Admin Routes & Controls
- CEO-only admin panel
- User CRUD operations
- Profile type management
- Permission assignment interface
- Department management

### 19. Balance & Token Management
- User token balance tracking
- Token spending and transaction logging
- Balance top-up functionality
- Transaction history
- Auto-refill settings
- Configurable token value

### 20. Role & Permission Management
- Dynamic role creation and assignment
- Resource-level permissions (agents, prompts, conversations)
- Access control lists (ACLs)
- Permission inheritance
- Bulk permission updates

### 21. Banners & Notifications
- Admin banner management
- User-facing notifications
- Feature announcements
- System-wide messaging

---

## 🔌 Integration & Extension Features

### 22. MCP (Model Context Protocol)
- External tool and service integration
- Server implementations
- Route handlers for MCP operations
- Client UI for MCP tools
- Dynamic tool discovery

### 23. Plugin System
- Plugin discovery and management
- Plugin execution framework
- Custom plugin support
- Web-based plugins

### 24. OAuth & Social Logins
- OAuth callback handling
- Social login configuration
- Account linking
- Token management and refresh

### 25. SharePoint Integration
- SharePoint document picker
- Document access and retrieval
- Enterprise document management

### 26. Web Plugin System
- Web-based plugin support
- Plugin type definitions
- Custom web integrations

---

## 📊 Data & Configuration Features

### 27. Configuration Management
- `librechat.yaml` for feature configuration
- Environment variable support
- Feature flags and toggles
- Interface customization
- File storage strategy configuration
- Registration settings
- Rate limiting configuration
- Speech (TTS/STT) configuration

### 28. Database Models
Comprehensive data models including:
- **User**: Authentication and profile data
- **Conversation**: Chat history with branching
- **Message**: Individual messages with attachments
- **Agent**: Custom AI agents (comprehensive 29KB model)
- **File**: File metadata and storage
- **Preset**: Saved configurations
- **Prompt**: Prompt library entries
- **Role**: RBAC roles
- **Transaction**: Token usage tracking
- **SocialAccount**: Social media platform connections (LinkedIn, Facebook, X, etc.)
- **Project**: Project management data
- **ToolCall**: Function calling logs
- **Action**: Workflow actions
- **Banner**: System notifications
- **ConversationTag**: Organization tags
- **Assistant**: OpenAI Assistants API

### 29. Search & Indexing
- Meilisearch integration for full-text search
- Conversation search
- User search
- Prompt search
- Tag-based organization

### 30. Caching & Performance
- Redis caching layer
- Session management via Redis
- Cache invalidation strategies
- Static asset caching with compression

---

## 🛠️ Development & Deployment Features

### 31. Testing Infrastructure
- Jest for unit and integration testing
- Playwright for E2E testing
- MongoDB memory server for testing
- Test coverage reporting
- Comprehensive test suites for models and controllers

### 32. Internationalization (i18n)
- 42+ language support
- i18next integration
- Automatic language detection
- Translation management via Locize
- RTL (Right-to-Left) language support

### 33. Logging & Monitoring
- Winston logger configuration
- Daily rotating file logs
- Error tracking and reporting
- Request logging
- Health check endpoints
- Audit trails

### 34. Docker & Containerization
- Docker Compose orchestration
- Multi-service setup:
  - API server
  - MongoDB database
  - Meilisearch
  - PostgreSQL (for RAG)
  - RAG API service
- Development and production configurations
- Environment-based deployment

---

## 📋 Feature Summary Table

| Feature Category | Key Features | Status |
|---|---|---|
| **Core Chat** | Multi-AI providers, conversations, messages, branching | ✅ Active |
| **Authentication** | JWT, OAuth, LDAP, SAML, 2FA | ✅ Active |
| **Files & Media** | Upload, storage, multimodal, image generation | ✅ Active |
| **Agents & Tools** | Agent marketplace, MCP, code interpreter, n8n | ✅ Active |
| **RAG** | Vector DB, embedding, semantic search | ✅ Active |
| **Profiles** | CEO, Employee, Customer dashboards | ✅ Active |
| **Signage Center** | Order management, print queue, payment tracking | ✅ Active |
| **Audit System** | Session tracking, reporting, approval workflow | ✅ Active (Feature-gated) |
| **Social Media** | LinkedIn Direct OAuth, multi-platform posting | ✅ Active |
| **n8n Workflows** | Workflow execution, function calling, webhooks | ✅ Active |
| **Admin Panel** | User management, roles, permissions, balance | ✅ Active |
| **Search** | Meilisearch, conversation search, tagging | ✅ Active |
| **Sharing** | Conversation sharing, access control, permissions | ✅ Active |
| **Plugins** | Plugin system, MCP, web plugins | ✅ Active |
| **i18n** | 42+ languages, translation management | ✅ Active |
| **Testing** | Jest, Playwright, comprehensive test coverage | ✅ Active |
| **Docker** | Multi-service containerization | ✅ Active |

---

## 🎯 Feature Highlights

### Enterprise-Ready
- Multi-tenancy support
- RBAC with fine-grained permissions
- LDAP/SAML integration
- Audit trails and compliance

### Extensible
- Plugin system
- MCP for external tools
- n8n workflow integration
- Custom agent creation

### Business-Focused
- Role-based dashboards (CEO, Employee, Customer)
- Signage center for print management
- Social media automation
- Audit management system

### Developer-Friendly
- Comprehensive API
- Docker deployment
- Extensive testing
- Well-documented codebase

---

## 📝 Notes

- This platform is built on LibreChat with extensive custom business features
- Feature flags allow selective enabling/disabling of functionality
- The system supports both self-hosted and cloud deployments
- Integration with external services (n8n, PDF Builder, LinkedIn API) extends functionality
- The codebase includes 42+ language translations for global deployment

---

**Last Updated**: March 10, 2026
