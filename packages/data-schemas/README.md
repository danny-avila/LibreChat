# `@librechat/data-schemas`

**Mongoose schemas, models, and methods for LibreChat**

This package provides a comprehensive, type-safe database layer for LibreChat using a factory function pattern. It includes Mongoose schemas, database models, and business logic methods organized in a modular, maintainable architecture.

## 📋 Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Directory Structure](#directory-structure)
- [Usage Examples](#usage-examples)
- [Development](#development)
- [Contributing](#contributing)

## ✨ Features

- **Factory Function Pattern**: Dependency injection for better testability and flexibility
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Modular Architecture**: Cleanly separated schemas, models, methods, and types
- **Memory Management**: Built-in user memory functionality for AI conversations
- **Session Management**: Secure session handling with refresh tokens
- **Role-Based Access**: Permission system with role management
- **Business Logic**: Encapsulated database operations and validations

## 🏗 Architecture Overview

The data-schemas package follows a layered architecture pattern:

```
┌─────────────────┐
│   Application   │  ← Uses methods from data-schemas
├─────────────────┤
│    Methods      │  ← Business logic & database operations
├─────────────────┤
│     Models      │  ← Mongoose models (created via factory functions)
├─────────────────┤
│    Schemas      │  ← Mongoose schemas & validation rules
├─────────────────┤
│    Database     │  ← MongoDB
└─────────────────┘
```

### Factory Function Pattern

This package uses factory functions that accept a mongoose instance, enabling:
- **Dependency Injection**: Pass mongoose instance for better testing
- **Model Isolation**: Prevent model conflicts in different contexts
- **Flexibility**: Easy integration with different mongoose configurations

## 📦 Installation

```bash
npm install @librechat/data-schemas
```

**Peer Dependencies Required:**
```bash
npm install mongoose librechat-data-provider jsonwebtoken
```

## 🚀 Quick Start

### Basic Setup

```javascript
import mongoose from 'mongoose';
import { createModels, createMethods } from '@librechat/data-schemas';

// Create all models
const models = createModels(mongoose);
const { User, Message, Conversation, MemoryEntry } = models;

// Create all methods
const methods = createMethods(mongoose);
const { findUser, createUser, setMemory, createSession } = methods;

// Now use models and methods in your application
```

### In Express.js Application

```javascript
// api/db/models.js
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const models = createModels(mongoose);
module.exports = { ...models };

// api/models/index.js  
const mongoose = require('mongoose');
const { createMethods } = require('@librechat/data-schemas');
const methods = createMethods(mongoose);
module.exports = { ...methods };
```

## 🧠 Core Concepts

### 1. Models vs Methods

- **Models**: Direct Mongoose model instances for basic CRUD operations
- **Methods**: Higher-level business logic functions that often use multiple models

```javascript
// Using Models (basic operations)
const user = await User.findById(userId);
await User.updateOne({ _id: userId }, { lastActivity: new Date() });

// Using Methods (business logic)
const token = await generateToken(user);
const result = await createUser(userData, balanceConfig);
```

### 2. Memory System

Built-in user memory for AI conversations:

```javascript
// Set user memory
await setMemory({
  userId: 'user123',
  key: 'preference',
  value: 'likes technical explanations',
  tokenCount: 15
});

// Get formatted memories
const { withKeys, withoutKeys } = await getFormattedMemories({ userId: 'user123' });
```

### 3. Session Management

Secure session handling with refresh tokens:

```javascript
// Create session
const { session, refreshToken } = await createSession(userId);

// Find session
const session = await findSession({ refreshToken });

// Delete session
await deleteSession({ sessionId: session._id });
```

### 4. Role-Based Access Control

```javascript
// Initialize default roles
await initializeRoles();

// List all roles
const roles = await listRoles();
```

## 📁 Directory Structure

```
src/
├── config/           # Configuration (Winston logger, etc.)
├── crypto/           # Cryptographic utilities (JWT, hashing)
├── methods/          # Business logic methods
│   ├── memory.ts     # Memory operations
│   ├── session.ts    # Session management  
│   ├── user.ts       # User operations
│   ├── role.ts       # Role management
│   ├── token.ts      # Token operations
│   └── index.ts      # Factory function exports
├── models/           # Mongoose model factories
│   ├── memory.ts     # Memory model
│   ├── user.ts       # User model
│   ├── session.ts    # Session model
│   └── index.ts      # Model factory exports
├── schema/           # Mongoose schemas
│   ├── memory.ts     # Memory schema
│   ├── user.ts       # User schema
│   ├── message.ts    # Message schema
│   └── index.ts      # Schema exports
├── types/            # TypeScript type definitions
└── index.ts          # Main package exports
```

## 🔧 Usage Examples

### User Management

```javascript
import { createMethods, createModels } from '@librechat/data-schemas';

const methods = createMethods(mongoose);
const models = createModels(mongoose);

// Create user with balance configuration
const userId = await methods.createUser(
  { email: 'user@example.com', username: 'john' },
  { enabled: true, startBalance: 1000 }
);

// Find user
const user = await methods.findUser({ email: 'user@example.com' });

// Generate JWT token
const token = await methods.generateToken(user);

// Count users
const totalUsers = await methods.countUsers({ provider: 'local' });
```

### Memory Operations

```javascript
// Set user memory
await methods.setMemory({
  userId: 'user123',
  key: 'coding_style',
  value: 'prefers functional programming',
  tokenCount: 25
});

// Get all user memories
const memories = await methods.getAllUserMemories('user123');

// Get formatted memories for AI context
const formatted = await methods.getFormattedMemories({ userId: 'user123' });
console.log(formatted.withKeys);
// Output: 1. [2024-01-15]. ["key": "coding_style"]. ["value": "prefers functional programming"]

// Delete specific memory
await methods.deleteMemory({ userId: 'user123', key: 'coding_style' });
```

### Session Management

```javascript
// Create new session
const { session, refreshToken } = await methods.createSession('user123');

// Find session by refresh token
const foundSession = await methods.findSession({ refreshToken });

// Update session expiration
await methods.updateExpiration(session, new Date(Date.now() + 86400000));

// Count active sessions
const activeCount = await methods.countActiveSessions('user123');

// Delete all user sessions except current
await methods.deleteAllUserSessions('user123', {
  excludeCurrentSession: true,
  currentSessionId: session._id
});
```

### Token Operations

```javascript
// Create verification token
const token = await methods.createToken({
  userId: 'user123',
  token: 'verification-token-123',
  type: 'email-verification',
  expiresIn: 3600 // 1 hour
});

// Find token
const foundToken = await methods.findToken({ 
  userId: 'user123', 
  type: 'email-verification' 
});

// Delete tokens
await methods.deleteTokens({ userId: 'user123' });
```

### Using Models Directly

```javascript
const { User, Message, Conversation } = createModels(mongoose);

// Direct model usage for complex queries
const recentMessages = await Message.find({
  conversationId: 'conv123',
  createdAt: { $gte: new Date(Date.now() - 86400000) }
}).populate('user').sort({ createdAt: -1 }).limit(50);

// Complex aggregation
const userStats = await User.aggregate([
  { $match: { provider: 'local' } },
  { $group: { _id: '$role', count: { $sum: 1 } } }
]);
```

## 🛠 Development

### Building the Package

```bash
# Clean and build
npm run build

# Build in watch mode
npm run build:watch

# Using Bun
bun run b:build
```

### Testing

```bash
# Run tests with coverage
npm run test

# CI testing
npm run test:ci

# Verify code integrity
npm run verify
```

### Adding New Models/Methods

1. **Create Schema** (`src/schema/newEntity.ts`):
```typescript
import { Schema } from 'mongoose';

const newEntitySchema = new Schema({
  name: { type: String, required: true },
  // ... other fields
}, { timestamps: true });

export default newEntitySchema;
```

2. **Create Model Factory** (`src/models/newEntity.ts`):
```typescript
import newEntitySchema from '~/schema/newEntity';
import type { INewEntity } from '~/types';

export function createNewEntityModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.NewEntity || mongoose.model<INewEntity>('NewEntity', newEntitySchema);
}
```

3. **Create Methods** (`src/methods/newEntity.ts`):
```typescript
export function createNewEntityMethods(mongoose: typeof import('mongoose')) {
  const NewEntity = mongoose.models.NewEntity;

  async function createNewEntity(data: CreateData) {
    return await NewEntity.create(data);
  }

  return { createNewEntity };
}

export type NewEntityMethods = ReturnType<typeof createNewEntityMethods>;
```

4. **Update Index Files**:
   - Add to `src/models/index.ts`
   - Add to `src/methods/index.ts`
   - Export types from `src/types/index.ts`

### Best Practices

- **Use Factory Functions**: Always use `createModels()` and `createMethods()`
- **Type Safety**: Define comprehensive TypeScript interfaces
- **Error Handling**: Use try-catch blocks and meaningful error messages
- **Documentation**: Document all methods with JSDoc comments
- **Testing**: Write unit tests for all new functionality

## 🤝 Contributing

1. Follow the factory function pattern for all new models/methods
2. Ensure full TypeScript coverage
3. Add comprehensive tests
4. Update documentation
5. Follow existing code style and patterns

### Code Style Guidelines

- Use async/await instead of Promises
- Implement proper error handling
- Follow functional programming principles where possible
- Use descriptive variable and function names
- Add JSDoc comments for all public methods

## 📚 API Reference

### Core Exports

- `createModels(mongoose)` - Factory function that returns all Mongoose models
- `createMethods(mongoose)` - Factory function that returns all business logic methods  
- `logger` - Winston logger instance configured for the package
- All schemas, types, and crypto utilities

### Available Models

User, Token, Session, Balance, Conversation, Message, Agent, Role, Action, Assistant, File, Banner, Project, Key, PluginAuth, Transaction, Preset, Prompt, PromptGroup, ConversationTag, SharedLink, ToolCall, MemoryEntry

### Available Methods

User: `findUser`, `createUser`, `updateUser`, `getUserById`, `deleteUserById`, `generateToken`, `countUsers`

Memory: `setMemory`, `deleteMemory`, `getAllUserMemories`, `getFormattedMemories`

Session: `createSession`, `findSession`, `updateExpiration`, `deleteSession`, `deleteAllUserSessions`, `countActiveSessions`, `generateRefreshToken`

Token: `createToken`, `findToken`, `updateToken`, `deleteTokens`

Role: `initializeRoles`, `listRoles`

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [LibreChat Repository](https://github.com/danny-avila/LibreChat)
- [Issues & Bug Reports](https://github.com/danny-avila/LibreChat/issues)  
- [LibreChat Website](https://librechat.ai)
