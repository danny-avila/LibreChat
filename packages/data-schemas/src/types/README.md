# Data Schemas - Refactored Architecture

This package has been refactored to follow a clean, modular architecture with clear separation of concerns.

## 📁 Directory Structure

```
packages/data-schemas/src/
├── index.ts              # Main exports
├── schema/               # 🗄️  Mongoose schema definitions
│   ├── user.ts
│   ├── session.ts
│   └── token.ts
├── models/               # 🏗️  Mongoose model instances  
│   └── index.ts
├── methods/              # ⚙️  Business logic functions
│   ├── index.ts
│   ├── user.ts
│   ├── session.ts
│   └── token.ts
└── types/                # 📋 TypeScript interfaces & types
    ├── index.ts
    ├── user.ts
    ├── session.ts
    └── token.ts
```

## 🎯 Key Benefits

### 1. **Separation of Concerns**
- **Schema**: Pure Mongoose schema definitions
- **Models**: Model instances created once 
- **Methods**: Business logic as pure functions
- **Types**: Shared TypeScript interfaces

### 2. **No Dynamic Imports**
- Models are created once in the models directory
- Methods import model instances directly
- No more dynamic `import()` calls

### 3. **Better Type Safety**
- Shared types across all layers
- Proper TypeScript typing throughout
- Clear interfaces for all operations

### 4. **Pure Functions**
- Methods are now side-effect free
- Easy to test and reason about
- No magic or hidden dependencies

## 🚀 Migration Guide

### Before (Static Methods)
```typescript
import { User } from 'some-model-registry';

// Old way with static methods
const user = await User.findUser({ email: 'test@example.com' });
const result = await User.deleteUserById(userId);
```

### After (Pure Functions)
```typescript
import { findUser, deleteUserById } from '~/methods';

// New way with pure functions
const user = await findUser({ email: 'test@example.com' });
const result = await deleteUserById(userId);
```

## 📚 Usage Examples

### User Operations
```typescript
import { 
  findUser, 
  createUser, 
  updateUser, 
  deleteUserById,
  generateToken 
} from '~/methods';

// Find a user
const user = await findUser(
  { email: 'user@example.com' }, 
  'name email role'
);

// Create a user with balance config
const newUser = await createUser(
  { email: 'new@example.com', name: 'John' },
  { enabled: true, startBalance: 100 },
  true, // disable TTL
  true  // return user object
);

// Update user
const updated = await updateUser(userId, { name: 'Jane' });

// Delete user
const result = await deleteUserById(userId);

// Generate JWT token
const token = await generateToken(user);
```

### Session Operations
```typescript
import { 
  createSession, 
  findSession, 
  deleteSession,
  deleteAllUserSessions 
} from '~/methods';

// Create session
const { session, refreshToken } = await createSession(userId);

// Find session by refresh token
const foundSession = await findSession({ refreshToken });

// Delete specific session
await deleteSession({ sessionId });

// Delete all user sessions
await deleteAllUserSessions(userId, { 
  excludeCurrentSession: true, 
  currentSessionId 
});
```

### Token Operations
```typescript
import { 
  createToken, 
  findToken, 
  updateToken,
  deleteTokens 
} from '~/methods';

// Create token
const token = await createToken({
  userId,
  token: 'abc123',
  type: 'verification',
  expiresIn: 3600 // 1 hour
});

// Find token
const foundToken = await findToken({ 
  token: 'abc123',
  type: 'verification' 
});

// Update token
const updated = await updateToken(
  { token: 'abc123' },
  { type: 'password-reset' }
);

// Delete tokens
await deleteTokens({ userId });
```

## 🔧 Path Aliases

The project uses `~/` as an alias for `./src/`:

```typescript
import { IUser } from '~/types';
import { User } from '~/models';
import { findUser } from '~/methods';
import userSchema from '~/schema/user';
```

## ⚠️ Breaking Changes

1. **Static Methods Removed**: All static methods have been removed from schema files
2. **Function Signatures**: Methods no longer take model as first parameter
3. **Import Paths**: Import from `~/methods` instead of calling static methods
4. **Type Definitions**: Types moved to dedicated `~/types` directory

## 🧪 Testing

The new pure function approach makes testing much easier:

```typescript
import { findUser } from '~/methods';

// Easy to mock and test
jest.mock('~/models', () => ({
  User: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      })
    })
  }
}));

test('findUser should return user', async () => {
  const result = await findUser({ email: 'test@example.com' });
  expect(result).toEqual(mockUser);
});
```

## 🔄 Error Handling

All methods include proper error handling with typed errors:

```typescript
import { SessionError } from '~/types';

try {
  const session = await createSession(userId);
} catch (error) {
  if (error instanceof SessionError) {
    console.log('Session error:', error.code, error.message);
  }
}
```

This refactoring provides a much cleaner, more maintainable, and type-safe architecture for data operations. 